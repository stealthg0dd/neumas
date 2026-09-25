from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.food_graph import RecipeCreateRequest
from app.services.food_graph_service import FoodGraphService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(user_id=uuid4(), org_id=uuid4(), property_id=uuid4(), role="admin", jwt="test")


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table: str):
        self.client = client
        self.table = table
        self.filters = []
        self._limit = None
        self.client.filters.setdefault(table, [])

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters.append((key, str(value)))
        self.client.filters[self.table].append((key, str(value)))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, value):
        self._limit = value
        return self

    def insert(self, payload):
        self.client.inserts.append((self.table, payload))
        self.client.pending_result = payload if isinstance(payload, list) else [payload]
        return self

    def upsert(self, payload, **kwargs):
        self.client.upserts.append((self.table, payload, kwargs))
        return self

    def update(self, payload):
        self.client.updates.append((self.table, payload))
        return self

    async def execute(self):
        if self.client.pending_result is not None:
            rows = self.client.pending_result
            self.client.pending_result = None
            for row in rows:
                row.setdefault("id", str(uuid4()))
            return _Resp(rows)
        rows = list(self.client.rows.get(self.table, []))
        for key, value in self.filters:
            rows = [row for row in rows if str(row.get(key)) == value]
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Resp(rows)


class _Client:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}
        self.upserts = []
        self.inserts = []
        self.updates = []
        self.pending_result = None

    def table(self, table: str):
        return _Query(self, table)


@pytest.mark.asyncio
async def test_uom_conversion():
    service = FoodGraphService()
    result = await service.convert_quantity(Decimal("2"), Decimal("1000"), Decimal("1"))
    assert result == Decimal("2000")


@pytest.mark.asyncio
async def test_recipe_cost_calculation_and_supplier_price_delta(monkeypatch, tenant: TenantContext):
    recipe_id = uuid4()
    version_id = uuid4()
    ingredient_id = uuid4()
    supplier_item_id = uuid4()
    client = _Client({
        "recipes": [{"id": str(recipe_id), "menu_price": "20", "currency": "USD", "active_version_id": str(version_id), "organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "created_at": "2026-01-01"}],
        "recipe_versions": [{"id": str(version_id), "serving_count": "4", "preparation_loss_pct": "10", "waste_allowance_pct": "5", "organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "created_at": "2026-01-01"}],
        "recipe_ingredients": [{"id": str(uuid4()), "canonical_ingredient_id": str(ingredient_id), "quantity": "2", "converted_base_quantity": "2", "organization_id": str(tenant.org_id), "recipe_version_id": str(version_id), "ingredient": {"canonical_name": "Tomato"}, "created_at": "2026-01-01"}],
        "supplier_items": [{"id": str(supplier_item_id), "canonical_ingredient_id": str(ingredient_id), "pack_quantity": "1", "base_quantity": "1", "organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "is_active": True, "created_at": "2026-01-01"}],
        "supplier_item_prices": [
            {"supplier_item_id": str(supplier_item_id), "price": "3.00", "organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "effective_at": "2026-01-02"},
            {"supplier_item_id": str(supplier_item_id), "price": "2.50", "organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "effective_at": "2026-01-01"},
        ],
    })
    monkeypatch.setattr("app.services.food_graph_service.get_async_supabase_admin", AsyncMock(return_value=client))

    result = await FoodGraphService().calculate_recipe_cost(tenant, recipe_id, version_id)

    assert result.latest_theoretical_cost == Decimal("6.90")
    assert result.cost_per_serving == Decimal("1.73")
    assert result.target_food_cost_pct == Decimal("8.65")
    assert result.theoretical_gross_margin == Decimal("18.27")
    assert result.ingredient_contributions[0].change_vs_previous_price == Decimal("0.50")


@pytest.mark.asyncio
async def test_recipe_versioning_creates_next_version(monkeypatch, tenant: TenantContext):
    recipe_id = uuid4()
    new_version_id = uuid4()
    client = _Client({
        "recipe_versions": [{"version_number": 2, "organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "recipe_id": str(recipe_id)}],
        "recipes": [{"id": str(recipe_id), "name": "Burger", "category": None, "menu_price": None, "currency": "USD", "active_version_id": str(new_version_id), "is_active": True, "organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "created_at": "2026-01-01"}],
    })
    monkeypatch.setattr("app.services.food_graph_service.get_async_supabase_admin", AsyncMock(return_value=client))

    result = await FoodGraphService().create_next_recipe_version(tenant, recipe_id, RecipeCreateRequest(name="Burger"))

    assert result.id == recipe_id
    assert client.inserts[0][0] == "recipe_versions"
    assert client.inserts[0][1]["version_number"] == 3


@pytest.mark.asyncio
async def test_food_graph_queries_are_tenant_isolated(monkeypatch, tenant: TenantContext):
    client = _Client({"recipes": []})
    monkeypatch.setattr("app.services.food_graph_service.get_async_supabase_admin", AsyncMock(return_value=client))

    await FoodGraphService().list_recipes(tenant)

    assert ("organization_id", str(tenant.org_id)) in client.filters["recipes"]
    assert ("property_id", str(tenant.property_id)) in client.filters["recipes"]


@pytest.mark.asyncio
async def test_import_preview_and_idempotent_commit(monkeypatch, tenant: TenantContext):
    client = _Client({})
    monkeypatch.setattr("app.services.food_graph_service.get_async_supabase_admin", AsyncMock(return_value=client))
    csv_text = "canonical_name,category\nTomato,Produce\n"

    preview = await FoodGraphService().import_csv(tenant, "canonical_ingredients", csv_text, commit=False)
    committed = await FoodGraphService().import_csv(tenant, "canonical_ingredients", csv_text, commit=True, idempotency_key="ing-1")

    assert preview.valid_rows == 1
    assert preview.receipt_id is None
    assert committed.receipt_id is not None
    assert client.upserts[0][0] == "canonical_ingredients"
    assert client.upserts[0][2]["on_conflict"] == "organization_id,canonical_name"
