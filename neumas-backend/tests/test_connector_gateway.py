from __future__ import annotations

import base64
import hashlib
import hmac
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.core.config import get_settings
from app.schemas.integrations import IntegrationConnectionResponse
from app.services.integrations.integration_service import IntegrationService
from app.services.integrations.square import SquareAdapter
from app.services.integrations.xero import XeroAdapter


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(user_id=uuid4(), org_id=uuid4(), property_id=uuid4(), role="admin", jwt="test")


class Resp:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = []
        self.pending = None

    def select(self, *_args):
        return self

    def eq(self, key, value):
        self.filters.append((key, str(value)))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def insert(self, payload):
        row = dict(payload)
        row.setdefault("id", str(uuid4()))
        self.client.rows.setdefault(self.table, []).append(row)
        self.client.inserts.append((self.table, row))
        self.pending = [row]
        return self

    def update(self, payload):
        self.client.updates.append((self.table, payload, list(self.filters)))
        for row in self.client.rows.get(self.table, []):
            if all(str(row.get(key)) == value for key, value in self.filters):
                row.update(payload)
        return self

    async def execute(self):
        if self.pending is not None:
            return Resp(self.pending)
        rows = list(self.client.rows.get(self.table, []))
        for key, value in self.filters:
            rows = [row for row in rows if str(row.get(key)) == value]
        return Resp(rows)


class Client:
    def __init__(self):
        self.rows = {}
        self.inserts = []
        self.updates = []

    def table(self, table):
        return Query(self, table)


def _clear_settings():
    get_settings.cache_clear()


def test_square_signature_verification(monkeypatch):
    monkeypatch.setenv("SQUARE_WEBHOOK_SIGNATURE_KEY", "secret")
    _clear_settings()
    body = b'{"event_id":"evt-1"}'
    url = "https://example.com/api/integrations/webhooks/square"
    signature = base64.b64encode(hmac.new(b"secret", url.encode() + body, hashlib.sha1).digest()).decode()
    assert SquareAdapter().verify_webhook_signature(notification_url=url, body=body, signature_header=signature)
    assert not SquareAdapter().verify_webhook_signature(notification_url=url, body=body, signature_header="bad")
    _clear_settings()


def test_square_disabled_when_credentials_are_unavailable(monkeypatch):
    for key in ("SQUARE_APPLICATION_ID", "SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"):
        monkeypatch.delenv(key, raising=False)
    _clear_settings()
    assert SquareAdapter().enabled is False
    _clear_settings()


def test_square_order_maps_to_canonical_sales_rows(monkeypatch):
    _clear_settings()
    rows = SquareAdapter().map_order_to_sales_rows({
        "id": "order-1",
        "created_at": "2026-09-25T12:30:00Z",
        "total_money": {"amount": 2500, "currency": "USD"},
        "line_items": [{"name": "Burger", "quantity": "2", "total_money": {"amount": 1800}}],
    })
    assert rows == [{
        "transaction_id": "square:order-1:0",
        "business_date": "2026-09-25",
        "service_period": "lunch",
        "item_name": "Burger",
        "quantity": "2",
        "gross_sales": "25",
        "net_sales": "25",
        "item_net_sales": "18",
        "currency": "USD",
    }]


@pytest.mark.asyncio
async def test_raw_event_dedupe_and_tenant_isolation(monkeypatch, tenant: TenantContext):
    client = Client()
    connection = IntegrationConnectionResponse(
        id=uuid4(),
        organization_id=tenant.org_id,
        property_id=tenant.property_id,
        adapter_type="pos",
        provider_slug="square",
        display_name="Square",
        status="connected",
        health_status="healthy",
        enabled=True,
        implemented=True,
        coming_soon=False,
    )
    monkeypatch.setattr("app.services.integrations.integration_service.get_async_supabase_admin", AsyncMock(return_value=client))
    service = IntegrationService()
    first = await service.record_raw_event(
        tenant,
        connection,
        provider_slug="square",
        event_type="order.created",
        external_event_id="evt-1",
        idempotency_key="square:evt-1",
        payload={"event_id": "evt-1"},
    )
    second = await service.record_raw_event(
        tenant,
        connection,
        provider_slug="square",
        event_type="order.created",
        external_event_id="evt-1",
        idempotency_key="square:evt-1",
        payload={"event_id": "evt-1"},
    )
    assert first["organization_id"] == str(tenant.org_id)
    assert first["property_id"] == str(tenant.property_id)
    assert second["duplicate"] is True
    assert len(client.rows["raw_provider_events"]) == 1


@pytest.mark.asyncio
async def test_connection_status_and_token_metadata(monkeypatch, tenant: TenantContext):
    connection_id = str(uuid4())
    fake_query = MagicMock()
    fake_query.execute = AsyncMock(return_value=SimpleNamespace(data=[{
        "id": connection_id,
        "organization_id": str(tenant.org_id),
        "property_id": str(tenant.property_id),
        "adapter_type": "accounting",
        "provider_slug": "xero",
        "display_name": "Xero",
        "status": "connected",
        "health_status": "healthy",
        "enabled": True,
        "credential_reference": "env:XERO_CLIENT_SECRET",
        "oauth_state": "state-1",
        "token_expires_at": "2026-09-25T12:00:00Z",
        "records_synced": 42,
    }]))
    fake_client = MagicMock()
    fake_client.table.return_value.select.return_value.eq.return_value.order.return_value = fake_query
    monkeypatch.setattr("app.services.integrations.integration_service.get_async_supabase_admin", AsyncMock(return_value=fake_client))
    status = await IntegrationService().connection_status(tenant)
    xero = next(item for item in status["connections"] if item.provider_slug == "xero")
    assert xero.availability == "connected"
    assert xero.credential_reference == "env:XERO_CLIENT_SECRET"
    assert xero.oauth_state == "state-1"
    assert xero.records_synced == 42


def test_xero_oauth_url_uses_env_config(monkeypatch):
    monkeypatch.setenv("XERO_CLIENT_ID", "client")
    monkeypatch.setenv("XERO_CLIENT_SECRET", "secret")
    monkeypatch.setenv("XERO_REDIRECT_URI", "https://example.com/xero/callback")
    _clear_settings()
    state = XeroAdapter().build_authorization_url(state="nonce")
    assert state.state == "nonce"
    assert "client_id=client" in state.authorization_url
    assert "accounting.contacts.read" in state.authorization_url
    _clear_settings()
