from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.margin import MarginInputs, WasteEventCreate
from app.services.margin_service import MarginService


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
        self.filters = {}

    def table(self, table):
        query = Query(self, table)
        self.filters.setdefault(table, query.filters)
        return query


def test_theoretical_food_cost_and_actual_procurement_cost_snapshot():
    service = MarginService()
    result = service.calculate_snapshot(MarginInputs(
        theoretical_food_cost=Decimal("100"),
        forecast_food_cost=Decimal("115"),
        purchased_cost=Decimal("120"),
        received_cost=Decimal("118"),
        invoiced_cost=Decimal("125"),
        revenue=Decimal("500"),
    ))
    assert result.food_cost_pct == Decimal("25.00")
    assert result.realized_food_cost == Decimal("125.00")
    assert any(driver["type"] == "unplanned_purchasing" for driver in result.drivers)


def test_variance_attribution_includes_supplier_price_waste_and_invoice_recovery():
    drivers = MarginService().attribute_leakage(MarginInputs(
        theoretical_food_cost=Decimal("100"),
        forecast_food_cost=Decimal("100"),
        purchased_cost=Decimal("100"),
        received_cost=Decimal("100"),
        invoiced_cost=Decimal("112"),
        supplier_variance=Decimal("7"),
        invoice_variance=Decimal("5"),
        waste_cost=Decimal("9"),
    ))
    by_type = {driver["type"]: driver["amount"] for driver in drivers}
    assert by_type["supplier_price_increase"] == Decimal("7.00")
    assert by_type["invoice_discrepancy"] == Decimal("5.00")
    assert by_type["waste"] == Decimal("9.00")


def test_unknown_attribution_when_evidence_is_insufficient():
    drivers = MarginService().attribute_leakage(MarginInputs(
        theoretical_food_cost=Decimal("100"),
        forecast_food_cost=Decimal("100"),
        purchased_cost=Decimal("100"),
        received_cost=Decimal("100"),
        invoiced_cost=Decimal("108"),
    ))
    assert drivers == [{"type": "UNKNOWN", "amount": Decimal("8.00"), "confidence": "insufficient_evidence"}]


def test_expected_vs_actual_outcome_learning_recommends_human_policy_review():
    result = MarginService().calculate_outcome(
        expected={"cost": Decimal("100"), "savings": Decimal("20"), "quantity": Decimal("10")},
        actual={
            "cost": Decimal("125"),
            "savings": Decimal("12"),
            "received_quantity": Decimal("8"),
            "stockout_occurred": True,
            "service_level_hit": False,
            "waste_impact": Decimal("4"),
        },
    )
    assert result.cost_variance == Decimal("25.00")
    assert result.savings_variance == Decimal("-8.00")
    assert result.quantity_variance == Decimal("-2.00")
    assert result.stockout_occurred is True
    assert {change["rule"] for change in result.recommended_policy_changes} == {
        "max_supplier_price_variance_pct",
        "safety_stock",
    }


@pytest.mark.asyncio
async def test_waste_event_is_tenant_scoped_and_posts_inventory_ledger(monkeypatch, tenant: TenantContext):
    client = Client()
    monkeypatch.setattr("app.services.margin_service.get_async_supabase_admin", AsyncMock(return_value=client))
    service = MarginService()
    ledger = AsyncMock(return_value={"id": str(uuid4())})
    monkeypatch.setattr(service.ledger, "record_waste", ledger)
    inventory_item_id = uuid4()

    row = await service.create_waste_event(tenant, WasteEventCreate(
        waste_type="spoilage",
        inventory_item_id=inventory_item_id,
        quantity=Decimal("3"),
        uom="kg",
        cost=Decimal("18.50"),
        reason="expired",
        source="manual",
        event_date=date(2026, 9, 25),
    ))

    assert row["organization_id"] == str(tenant.org_id)
    assert row["property_id"] == str(tenant.property_id)
    ledger.assert_awaited_once()
    args, kwargs = ledger.await_args
    assert args[1] == inventory_item_id
    assert args[2] == 3.0
    assert kwargs["idempotency_key"] == f"waste:{row['id']}"


@pytest.mark.asyncio
async def test_margin_dashboard_uses_tenant_filters_and_no_fake_fallbacks(monkeypatch, tenant: TenantContext):
    client = Client()
    other_org = str(uuid4())
    client.rows = {
        "margin_snapshots": [
            {
                "organization_id": str(tenant.org_id),
                "property_id": str(tenant.property_id),
                "food_cost_pct": "31.2",
                "realized_food_cost": "312",
                "supplier_variance": "14",
                "invoice_variance": "5",
                "margin_leakage": "22",
                "drivers": [{"type": "supplier_price_increase", "amount": "14"}],
                "created_at": "2026-09-25T00:00:00Z",
            },
            {
                "organization_id": other_org,
                "property_id": str(tenant.property_id),
                "food_cost_pct": "99",
                "margin_leakage": "999",
                "created_at": "2026-09-25T00:00:00Z",
            },
        ],
        "waste_events": [
            {
                "organization_id": str(tenant.org_id),
                "property_id": str(tenant.property_id),
                "cost": "6",
                "waste_type": "prep",
                "created_at": "2026-09-25T00:00:00Z",
            }
        ],
    }
    monkeypatch.setattr("app.services.margin_service.get_async_supabase_admin", AsyncMock(return_value=client))

    summary = await MarginService().dashboard(tenant)

    assert summary.top_metrics["food_cost_pct"] == Decimal("31.2")
    assert summary.top_metrics["waste_cost"] == Decimal("6")
    assert summary.top_metrics["savings_captured"] is None
    assert summary.cost_trend[0]["organization_id"] == str(tenant.org_id)
