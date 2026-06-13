from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext, get_tenant_context
from app.db.repositories.shopping_lists import ShoppingListsRepository
from app.main import app


class _Resp:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    """Minimal PostgREST-query stand-in that reproduces the real
    "more than one relationship was found" error for ambiguous embeds of
    shopping_list_items under shopping_lists."""

    def __init__(self, table: str):
        self.table = table
        self.select_str = ""

    def select(self, select_str, *_args, **_kwargs):
        self.select_str = select_str
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def single(self):
        return self

    async def execute(self):
        if (
            self.table == "shopping_lists"
            and "shopping_list_items" in self.select_str
            and "shopping_list_items!" not in self.select_str
        ):
            raise Exception(
                "more than one relationship was found for 'shopping_lists' "
                "and 'shopping_list_items'"
            )
        return _Resp([])


class _FakeShoppingClient:
    def table(self, name: str):
        return _FakeQuery(name)


@pytest.mark.anyio
async def test_get_by_property_embed_uses_explicit_fk_hint():
    """shopping_lists.get_by_property must disambiguate the shopping_list_items
    embed with an explicit FK hint, or PostgREST raises "more than one
    relationship was found"."""
    repo = ShoppingListsRepository(_FakeShoppingClient())
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="test-token",
    )

    result = await repo.get_by_property(tenant)

    assert result == []


@pytest.mark.anyio
async def test_analytics_summary_returns_200_without_relationship_ambiguity(monkeypatch, caplog):
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="test-token",
    )

    async def _tenant_override() -> TenantContext:
        return tenant

    fake_inventory_repo = SimpleNamespace(get_items_by_property=AsyncMock(return_value=[]))
    fake_predictions_repo = SimpleNamespace(get_by_property=AsyncMock(return_value=[]))
    fake_scans_repo = SimpleNamespace(get_by_property=AsyncMock(return_value=[]))
    fake_shopping_repo = ShoppingListsRepository(_FakeShoppingClient())

    monkeypatch.setattr(
        "app.api.routes.analytics.get_inventory_repository",
        AsyncMock(return_value=fake_inventory_repo),
    )
    monkeypatch.setattr(
        "app.api.routes.analytics.get_predictions_repository",
        AsyncMock(return_value=fake_predictions_repo),
    )
    monkeypatch.setattr(
        "app.api.routes.analytics.get_scans_repository",
        AsyncMock(return_value=fake_scans_repo),
    )
    monkeypatch.setattr(
        "app.api.routes.analytics.get_shopping_lists_repository",
        AsyncMock(return_value=fake_shopping_repo),
    )

    app.dependency_overrides[get_tenant_context] = _tenant_override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/analytics/summary")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "more than one relationship" not in caplog.text
    assert "Failed to fetch shopping lists" not in caplog.text


@pytest.mark.anyio
async def test_inventory_list_includes_supplier_info_without_schema_drift_warning(monkeypatch, caplog):
    """Once supplier_info is a real column, list_items should return it as
    part of the normal response with no schema-drift retry warning."""
    from app.db.repositories.inventory import InventoryRepository

    property_id = uuid4()
    item_id = uuid4()
    now = datetime.now(UTC).isoformat()
    row = {
        "id": str(item_id),
        "property_id": str(property_id),
        "organization_id": str(uuid4()),
        "category_id": None,
        "vendor_id": None,
        "name": "Milk",
        "description": None,
        "sku": None,
        "barcode": None,
        "unit": "unit",
        "quantity": "5",
        "min_quantity": "1",
        "max_quantity": None,
        "reorder_point": None,
        "cost_per_unit": None,
        "average_daily_usage": None,
        "auto_reorder_enabled": False,
        "safety_buffer": "0",
        "currency": "USD",
        "supplier_info": {"name": "Acme Foods"},
        "metadata": {},
        "tags": [],
        "is_active": True,
        "last_scanned_at": None,
        "created_at": now,
        "updated_at": now,
        "category": None,
    }

    class _Query:
        def __init__(self, select_str):
            self.select_str = select_str

        def select(self, select_str, *_a, **_k):
            self.select_str = select_str
            return self

        def eq(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def range(self, *_a, **_k):
            return self

        async def execute(self):
            return _Resp([row])

    class _Client:
        def table(self, _name):
            return _Query("")

    repo = InventoryRepository(_Client())
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=property_id,
        role="staff",
        jwt="test-token",
    )

    items = await repo.get_items_by_property(tenant, limit=10)

    assert items[0]["supplier_info"] == {"name": "Acme Foods"}
    assert "Inventory schema drift detected" not in caplog.text
