from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.demand import ForecastGenerateRequest
from app.services.demand_service import DemandService


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
        self.client.filters.setdefault(table, [])
        self.pending = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters.append((key, str(value)))
        self.client.filters[self.table].append((key, str(value)))
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        rows = payload if isinstance(payload, list) else [payload]
        for row in rows:
            row.setdefault("id", str(uuid4()))
        self.client.inserts.append((self.table, rows))
        self.pending = rows
        return self

    def upsert(self, payload, **kwargs):
        rows = payload if isinstance(payload, list) else [payload]
        for row in rows:
            row.setdefault("id", str(uuid4()))
        self.client.upserts.append((self.table, rows, kwargs))
        self.pending = rows
        return self

    async def execute(self):
        if self.pending is not None:
            return _Resp(self.pending)
        rows = list(self.client.rows.get(self.table, []))
        for key, value in self.filters:
            rows = [row for row in rows if str(row.get(key)) == value]
        return _Resp(rows)


class _Client:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}
        self.inserts = []
        self.upserts = []

    def table(self, table: str):
        return _Query(self, table)


@pytest.mark.asyncio
async def test_sales_import_is_idempotent_and_records_receipt(monkeypatch, tenant: TenantContext):
    client = _Client({})
    monkeypatch.setattr("app.services.demand_service.get_async_supabase_admin", AsyncMock(return_value=client))
    csv_text = "business_date,item_name,quantity,transaction_id,net_sales\n2026-09-24,Burger,10,tx-1,120\n"

    result = await DemandService().import_csv(tenant, "sales.csv", csv_text, commit=True, idempotency_key="sales-1")

    assert result.valid_rows == 1
    assert result.receipt_id is not None
    assert client.upserts[0][0] == "sales_transactions"
    assert client.upserts[0][2]["on_conflict"] == "organization_id,property_id,external_id"
    assert any(table == "import_receipts" for table, _rows, _kwargs in client.upserts)


@pytest.mark.asyncio
async def test_demand_forecast_generation_and_tenant_isolation(monkeypatch, tenant: TenantContext):
    today = date.today()
    sales_rows = [
        {
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id),
            "item_name": "Burger",
            "quantity": "10",
            "created_at": (today - timedelta(days=i)).isoformat(),
            "sales_transaction": {"business_date": (today - timedelta(days=i)).isoformat(), "service_period": "dinner"},
        }
        for i in range(1, 15)
    ]
    client = _Client({
        "sales_transaction_items": sales_rows,
        "demand_signals": [{"organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "signal_type": "EVENT", "signal_date": today.isoformat(), "value": "20", "confidence": "0.8"}],
        "inventory_items": [{"organization_id": str(tenant.org_id), "property_id": str(tenant.property_id), "name": "Burger", "quantity": "30"}],
    })
    monkeypatch.setattr("app.services.demand_service.get_async_supabase_admin", AsyncMock(return_value=client))

    result = await DemandService().generate_forecast(tenant, ForecastGenerateRequest(forecast_date=today, horizon_days=7), persist=False)

    assert result.items
    assert result.items[0].forecast_demand > Decimal("70")
    assert result.items[0].required_quantity > Decimal("0")
    assert result.confidence > Decimal("0")
    for table in ("sales_transaction_items", "demand_signals", "inventory_items"):
        assert ("organization_id", str(tenant.org_id)) in client.filters[table]
        assert ("property_id", str(tenant.property_id)) in client.filters[table]


def test_recipe_explosion_to_ingredient_requirements():
    ingredient_id = str(uuid4())
    version_id = str(uuid4())
    totals = DemandService().explode_recipe_demand(
        Decimal("12"),
        [{"recipe_version_id": version_id, "quantity_multiplier": "1.5"}],
        {version_id: [{"canonical_ingredient_id": ingredient_id, "converted_base_quantity": "0.2"}]},
    )
    assert totals[ingredient_id] == Decimal("3.60")


@pytest.mark.asyncio
async def test_forecast_confidence_and_evaluation():
    service = DemandService()
    evaluation = await service.evaluate_forecast(
        [Decimal("10"), Decimal("20")],
        [Decimal("12"), Decimal("18")],
        [Decimal("0.8"), Decimal("0.7")],
    )

    assert evaluation.sample_size == 2
    assert evaluation.mae == Decimal("2.00")
    assert evaluation.bias == Decimal("0.00")
    assert evaluation.confidence_calibration is not None


@pytest.mark.asyncio
async def test_import_validation_row_errors(tenant: TenantContext):
    result = await DemandService().import_csv(
        tenant,
        "sales.csv",
        "business_date,item_name,quantity\n2026-09-24,,5\n",
        commit=False,
    )
    assert result.error_rows == 1
    assert result.errors[0].code == "missing_required"
