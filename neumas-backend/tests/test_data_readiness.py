from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext, get_tenant_context
from app.main import app
from app.services.data_readiness_service import DataReadinessService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="admin",
        jwt="test-token",
    )


class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, table: str, fixtures: dict[str, dict], filters: dict[str, list[tuple[str, str]]]):
        self.table = table
        self.fixtures = fixtures
        self.filters = filters
        filters.setdefault(table, [])
        self.updated_column = "updated_at"

    def select(self, column, **_kwargs):
        self.updated_column = str(column).split(",")[0]
        return self

    def eq(self, key, value):
        self.filters[self.table].append((key, value))
        return self

    def order(self, column, **_kwargs):
        self.updated_column = column
        return self

    def limit(self, *_args):
        return self

    async def execute(self):
        fixture = self.fixtures.get(self.table)
        if fixture is None:
            raise RuntimeError(f"missing table {self.table}")
        count = fixture.get("count", 0)
        updated_at = fixture.get("last_updated")
        data = [{self.updated_column: updated_at}] if count else []
        return _Resp(data, count=count)


class _Client:
    def __init__(self, fixtures: dict[str, dict], filters: dict[str, list[tuple[str, str]]]):
        self.fixtures = fixtures
        self.filters = filters

    def table(self, table: str):
        return _Query(table, self.fixtures, self.filters)


@pytest.mark.asyncio
async def test_data_readiness_classifies_missing_and_ready_sources(monkeypatch, tenant: TenantContext):
    filters: dict[str, list[tuple[str, str]]] = {}
    fixtures = {
        "sales_transactions": {"count": 12, "last_updated": "2026-09-26T00:00:00+00:00"},
        "inventory_items": {"count": 5, "last_updated": "2026-09-26T01:00:00+00:00"},
        "vendors": {"count": 2, "last_updated": "2026-09-25T00:00:00+00:00"},
        "supplier_items": {"count": 4, "last_updated": "2026-09-25T01:00:00+00:00"},
        "supplier_item_offers": {"count": 4, "last_updated": "2026-09-25T02:00:00+00:00"},
        "supplier_item_prices": {"count": 4, "last_updated": "2026-09-25T03:00:00+00:00"},
        "recipes": {"count": 0},
        "recipe_ingredients": {"count": 0},
        "canonical_ingredients": {"count": 0},
        "documents": {"count": 1, "last_updated": "2026-09-24T00:00:00+00:00"},
        "invoices": {"count": 0},
        "purchase_orders": {"count": 0},
        "shopping_lists": {"count": 0},
        "demand_signals": {"count": 0},
        "demand_forecasts": {"count": 0},
        "predictions": {"count": 0},
        "procurement_recommendations": {"count": 0},
        "margin_snapshots": {"count": 0},
        "waste_events": {"count": 0},
        "reconciliation_cases": {"count": 0},
    }
    monkeypatch.setattr(
        "app.services.data_readiness_service.get_async_supabase_admin",
        AsyncMock(return_value=_Client(fixtures, filters)),
    )

    readiness = await DataReadinessService().build(tenant)

    assert readiness.sales_data.status == "READY"
    assert readiness.inventory_data.status == "READY"
    assert readiness.supplier_data.status == "READY"
    assert readiness.recipe_data.status == "MISSING"
    assert readiness.forecast_ready.status == "PARTIAL"
    assert readiness.procurement_ready.status == "PARTIAL"
    assert readiness.margin_ready.status == "PARTIAL"
    assert readiness.sales_data.last_updated == datetime(2026, 9, 26, tzinfo=UTC)
    assert ("organization_id", str(tenant.org_id)) in filters["sales_transactions"]
    assert ("property_id", str(tenant.property_id)) in filters["sales_transactions"]


@pytest.mark.anyio
async def test_data_readiness_endpoint(monkeypatch, tenant: TenantContext):
    async def _tenant_override() -> TenantContext:
        return tenant

    app.dependency_overrides[get_tenant_context] = _tenant_override
    monkeypatch.setattr(
        "app.api.routes.data_readiness.data_readiness_service.build",
        AsyncMock(
            return_value={
                "organization_id": str(tenant.org_id),
                "property_id": str(tenant.property_id),
                "sales_data": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Connect POS or upload sales.csv"},
                "inventory_data": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Import inventory.csv or upload invoices/receipts"},
                "supplier_data": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Add suppliers and supplier pricing"},
                "recipe_data": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Import recipes and canonical ingredients"},
                "invoice_data": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Upload supplier invoices or connect accounting"},
                "purchase_order_data": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Create purchase orders or approve reorder plans"},
                "demand_history": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Import sales history, reservations, events, or manual demand signals"},
                "forecast_ready": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Generate forecasts after sales or demand history is available"},
                "procurement_ready": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Add inventory, supplier pricing, and demand forecasts"},
                "margin_ready": {"status": "MISSING", "record_count": 0, "last_updated": None, "required_action": "Add recipes, supplier costs, invoices, and waste records"},
                "blockers": ["sales_data: Connect POS or upload sales.csv"],
            }
        ),
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/data-readiness")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["sales_data"]["status"] == "MISSING"
