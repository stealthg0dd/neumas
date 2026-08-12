from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext, get_tenant_context
from app.main import app
from app.schemas.integrations import ExternalDomainEvent, IntegrationConnectionResponse
from app.services.integrations.integration_service import IntegrationService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="admin",
        jwt="integration-jwt",
    )


@pytest.fixture
def override_tenant():
    def _install(tenant_ctx: TenantContext):
        async def _tenant_override() -> TenantContext:
            return tenant_ctx

        app.dependency_overrides[get_tenant_context] = _tenant_override

    yield _install
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_list_connections_returns_catalog_when_no_integrations(monkeypatch, tenant: TenantContext):
    service = IntegrationService()
    fake_client = MagicMock()
    fake_query = AsyncMock()
    fake_query.execute = AsyncMock(return_value=SimpleNamespace(data=[]))
    fake_client.table.return_value.select.return_value.eq.return_value.order.return_value = fake_query
    monkeypatch.setattr(
        "app.services.integrations.integration_service.get_async_supabase_admin",
        AsyncMock(return_value=fake_client),
    )

    connections = await service.list_connections(tenant)

    assert len(connections) >= 4
    assert {entry.provider_slug for entry in connections} >= {
        "storehub",
        "qashier",
        "email-receipt-import",
        "grocery-partner-connections",
    }
    assert all(entry.organization_id == tenant.org_id for entry in connections)
    assert all(entry.status == "not_connected" for entry in connections)


@pytest.mark.anyio
async def test_record_event_receipt_is_idempotent(monkeypatch, tenant: TenantContext):
    service = IntegrationService()
    connection = IntegrationConnectionResponse(
        id=uuid4(),
        organization_id=tenant.org_id,
        property_id=tenant.property_id,
        adapter_type="pos",
        provider_slug="storehub",
        display_name="StoreHub",
        status="connected",
        health_status="healthy",
        enabled=True,
        implemented=True,
        coming_soon=False,
    )
    event = ExternalDomainEvent(
        adapter_type="pos",
        provider_slug="storehub",
        event_type="sale.completed",
        external_event_id="evt-123",
        idempotency_key="sale:evt-123",
        occurred_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        property_id=tenant.property_id,
        payload={"lines": 2},
    )

    existing_query = AsyncMock()
    existing_query.execute = AsyncMock(
        return_value=SimpleNamespace(
            data=[
                {
                    "integration_connection_id": str(connection.id),
                    "external_event_id": event.external_event_id,
                    "status": "processed",
                }
            ]
        )
    )
    table_mock = MagicMock()
    table_mock.select.return_value.eq.return_value.eq.return_value.limit.return_value = existing_query
    fake_client = MagicMock()
    fake_client.table.return_value = table_mock

    monkeypatch.setattr(
        "app.services.integrations.integration_service.get_async_supabase_admin",
        AsyncMock(return_value=fake_client),
    )

    result = await service.record_event_receipt(
        tenant,
        connection,
        event,
        status="processed",
        result_summary={"normalized": 1},
    )

    assert result["external_event_id"] == "evt-123"
    assert result["status"] == "processed"
    assert not table_mock.insert.called


@pytest.mark.anyio
async def test_ingest_event_rejects_cross_tenant_connection(tenant: TenantContext):
    service = IntegrationService()
    connection = IntegrationConnectionResponse(
        id=uuid4(),
        organization_id=uuid4(),
        property_id=tenant.property_id,
        adapter_type="pos",
        provider_slug="storehub",
        display_name="StoreHub",
        status="connected",
        health_status="healthy",
        enabled=True,
        implemented=True,
        coming_soon=False,
    )
    event = ExternalDomainEvent(
        adapter_type="pos",
        provider_slug="storehub",
        event_type="sale.completed",
        external_event_id="evt-tenant-mismatch",
        idempotency_key="sale:evt-tenant-mismatch",
        occurred_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        property_id=tenant.property_id,
        payload={},
    )

    with pytest.raises(PermissionError, match="tenant"):
        await service.ingest_event(tenant, connection, event, AsyncMock())


@pytest.mark.anyio
async def test_ingest_event_retries_failed_handler_and_records_failure(monkeypatch, tenant: TenantContext):
    service = IntegrationService()
    connection = IntegrationConnectionResponse(
        id=uuid4(),
        organization_id=tenant.org_id,
        property_id=tenant.property_id,
        adapter_type="receipt_source",
        provider_slug="email-receipt-import",
        display_name="Email receipt import",
        status="connected",
        health_status="degraded",
        enabled=True,
        implemented=True,
        coming_soon=False,
    )
    event = ExternalDomainEvent(
        adapter_type="receipt_source",
        provider_slug="email-receipt-import",
        event_type="receipt.received",
        external_event_id="evt-retryable",
        idempotency_key="receipt:evt-retryable",
        occurred_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        property_id=tenant.property_id,
        payload={"document_type": "invoice"},
    )
    recorded_statuses: list[str] = []

    async def fake_record(*args, **kwargs):
        recorded_statuses.append(kwargs["status"])
        return {"status": kwargs["status"]}

    monkeypatch.setattr(service, "record_event_receipt", fake_record)

    with pytest.raises(RuntimeError, match="temporary"):
        await service.ingest_event(
            tenant,
            connection,
            event,
            AsyncMock(side_effect=RuntimeError("temporary upstream failure")),
        )

    assert recorded_statuses == ["failed"]


@pytest.mark.anyio
async def test_ingest_event_uses_handler_without_touching_ledger(monkeypatch, tenant: TenantContext):
    service = IntegrationService()
    connection = IntegrationConnectionResponse(
        id=uuid4(),
        organization_id=tenant.org_id,
        property_id=tenant.property_id,
        adapter_type="supplier",
        provider_slug="supplier-harness",
        display_name="Supplier harness",
        status="connected",
        health_status="healthy",
        enabled=True,
        implemented=True,
        coming_soon=False,
    )
    event = ExternalDomainEvent(
        adapter_type="supplier",
        provider_slug="supplier-harness",
        event_type="invoice.received",
        external_event_id="evt-invoice-1",
        idempotency_key="invoice:evt-invoice-1",
        occurred_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        property_id=tenant.property_id,
        payload={"source": "supplier_portal"},
    )
    ledger_calls: list[str] = []
    recorded_statuses: list[str] = []

    async def fake_record(*args, **kwargs):
        recorded_statuses.append(kwargs["status"])
        return {"status": kwargs["status"]}

    async def handler(
        tenant_ctx: TenantContext,
        connection_row: IntegrationConnectionResponse,
        inbound_event: ExternalDomainEvent,
    ) -> dict:
        assert tenant_ctx.org_id == tenant.org_id
        assert connection_row.provider_slug == "supplier-harness"
        assert inbound_event.event_type == "invoice.received"
        return {
            "normalized_event_type": "document.ingest_requested",
            "pipeline": "existing_document_pipeline",
            "ledger_boundary_preserved": True,
        }

    monkeypatch.setattr(service, "record_event_receipt", fake_record)
    monkeypatch.setattr(
        "app.services.inventory_ledger_service.InventoryLedgerService.apply_movement",
        AsyncMock(side_effect=lambda *args, **kwargs: ledger_calls.append("called")),
        raising=False,
    )

    result = await service.ingest_event(tenant, connection, event, handler)

    assert result["pipeline"] == "existing_document_pipeline"
    assert recorded_statuses == ["processed"]
    assert ledger_calls == []


@pytest.mark.anyio
async def test_admin_integrations_endpoint_requires_admin(override_tenant):
    override_tenant(
        TenantContext(
            user_id=uuid4(),
            org_id=uuid4(),
            property_id=uuid4(),
            role="staff",
            jwt="staff-jwt",
        )
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/admin/integrations",
            headers={"Authorization": "Bearer staff-jwt"},
        )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.anyio
async def test_admin_integrations_endpoint_returns_catalog(override_tenant, monkeypatch, tenant: TenantContext):
    override_tenant(tenant)
    fake_service = AsyncMock()
    fake_service.list_connections = AsyncMock(
        return_value=[
            IntegrationConnectionResponse(
                adapter_type="pos",
                provider_slug="storehub",
                display_name="StoreHub",
                status="not_connected",
                health_status="unknown",
                implemented=False,
                coming_soon=True,
                organization_id=tenant.org_id,
                property_id=tenant.property_id,
            )
        ]
    )
    monkeypatch.setattr("app.api.routes.admin._integration_service", fake_service)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/admin/integrations",
            headers={"Authorization": f"Bearer {tenant.jwt}"},
        )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body[0]["provider_slug"] == "storehub"
    assert body[0]["status"] == "not_connected"
