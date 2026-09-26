from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.autonomy import ActionRequest, DecisionInput, Policy
from app.schemas.demand import ForecastGenerateRequest
from app.schemas.margin import MarginInputs
from app.schemas.procurement import IngredientRequirement, SupplierOffer
from app.schemas.purchasing import (
    GoodsReceiptCreate,
    GoodsReceiptItemInput,
    PurchaseOrderCreate,
    PurchaseOrderItemInput,
    SupplierAcknowledgementCreate,
    SupplierInvoiceCreate,
    SupplierInvoiceItemInput,
)
from app.services.autonomy_service import AutonomyService
from app.services.demand_service import DemandService
from app.services.margin_service import MarginService
from app.services.procurement_optimizer_service import ProcurementOptimizerService
from app.services.purchasing_service import PurchasingService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(user_id=uuid4(), org_id=uuid4(), property_id=uuid4(), role="admin", jwt="release")


class Resp:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = []
        self.pending = None
        self.select_clause = ""

    def select(self, clause="*"):
        self.select_clause = clause
        return self

    def eq(self, key, value):
        self.filters.append((key, str(value)))
        return self

    def gte(self, key, value):
        self.filters.append((key, (">=", str(value))))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def insert(self, payload):
        rows = payload if isinstance(payload, list) else [payload]
        out = []
        for row in rows:
            row = dict(row)
            row.setdefault("id", str(uuid4()))
            self.client.rows.setdefault(self.table, []).append(row)
            out.append(row)
        self.client.inserts.extend((self.table, row) for row in out)
        self.pending = out
        return self

    def upsert(self, payload, **_kwargs):
        return self.insert(payload)

    def update(self, payload):
        for row in self.client.rows.get(self.table, []):
            if self._matches(row):
                row.update(payload)
        self.client.updates.append((self.table, payload))
        return self

    async def execute(self):
        if self.pending is not None:
            return Resp(self.pending)
        rows = [dict(row) for row in self.client.rows.get(self.table, []) if self._matches(row)]
        if self.table == "sales_transaction_items" and "sales_transaction:" in self.select_clause:
            tx_by_id = {str(row["id"]): row for row in self.client.rows.get("sales_transactions", [])}
            for row in rows:
                row["sales_transaction"] = tx_by_id.get(str(row.get("sales_transaction_id")), {})
        return Resp(rows)

    def _matches(self, row):
        for key, expected in self.filters:
            value = str(row.get(key))
            if isinstance(expected, tuple):
                op, threshold = expected
                if op == ">=" and value < threshold:
                    return False
            elif value != expected:
                return False
        return True


class Client:
    def __init__(self):
        self.rows = {}
        self.inserts = []
        self.updates = []

    def table(self, table):
        return Query(self, table)


@pytest.mark.asyncio
async def test_autonomous_procurement_release_workflow(monkeypatch, tenant: TenantContext):
    client = Client()
    monkeypatch.setattr("app.services.demand_service.get_async_supabase_admin", AsyncMock(return_value=client))
    monkeypatch.setattr("app.services.autonomy_service.get_async_supabase_admin", AsyncMock(return_value=client))
    monkeypatch.setattr("app.services.purchasing_service.get_async_supabase_admin", AsyncMock(return_value=client))

    demand = DemandService()
    today = date.today()
    csv_text = "\n".join([
        "business_date,transaction_id,item_name,quantity,net_sales,currency",
        f"{(today - timedelta(days=1)).isoformat()},tx-1,Chicken Bowl,10,120,USD",
        f"{(today - timedelta(days=8)).isoformat()},tx-2,Chicken Bowl,8,96,USD",
    ])
    import_result = await demand.import_csv(tenant, "sales.csv", csv_text, commit=True, idempotency_key="release-sales", source_filename="sales.csv")
    forecast = await demand.generate_forecast(tenant, ForecastGenerateRequest(forecast_date=today, horizon_days=7), persist=False)
    ingredient_id = uuid4()
    exploded = demand.explode_recipe_demand(
        Decimal("18"),
        [{"recipe_version_id": "rv-1", "quantity_multiplier": "1"}],
        {"rv-1": [{"canonical_ingredient_id": str(ingredient_id), "converted_base_quantity": "0.25"}]},
    )

    requirement = IngredientRequirement(
        canonical_ingredient_id=ingredient_id,
        ingredient_name="Chicken",
        demand_quantity=exploded[str(ingredient_id)],
        safety_stock=Decimal("2"),
        current_inventory=Decimal("1"),
        on_order_quantity=Decimal("0"),
        expected_waste=Decimal("0.5"),
    )
    vendor_id = uuid4()
    recommendation = ProcurementOptimizerService().optimize(requirement, [
        SupplierOffer(
            id=uuid4(),
            vendor_id=vendor_id,
            vendor_name="Release Supplier",
            canonical_ingredient_id=ingredient_id,
            pack_quantity=Decimal("5"),
            normalized_base_quantity=Decimal("5"),
            unit_price=Decimal("9"),
            contract_price=Decimal("8"),
            moq=Decimal("5"),
            delivery_fee=Decimal("2"),
            lead_time_days=1,
            approved=True,
            availability="available",
        )
    ])

    autonomy = AutonomyService()
    decision = await autonomy.create_decision(
        tenant,
        DecisionInput(
            trigger_type="procurement_recommendation",
            subject_type="canonical_ingredient",
            subject_id=ingredient_id,
            decision_type="purchase",
            title="Purchase Chicken",
            proposed_action={"amount": str(recommendation.expected_cost), "supplier_id": str(vendor_id)},
            evidence={"supplier_approved": True, "recommendation": recommendation.model_dump(mode="json")},
            confidence=recommendation.confidence,
            idempotency_key="release-decision",
        ),
        Policy(name="Release auto policy", autonomy_mode="AUTO_EXECUTE"),
    )
    action = await autonomy.execute_action(
        tenant,
        ActionRequest(
            decision_id=decision.id,
            provider="manual_internal",
            action_type="create_purchase_order",
            payload={"external_write": False, "recommendation_id": recommendation.id},
            idempotency_key="release-action",
        ),
    )

    purchasing = PurchasingService()
    monkeypatch.setattr(purchasing.ledger, "apply_purchase", AsyncMock(return_value={"id": str(uuid4())}))
    inventory_item_id = uuid4()
    po = await purchasing.create_purchase_order(
        tenant,
        PurchaseOrderCreate(
            vendor_id=vendor_id,
            decision_id=decision.id,
            items=[PurchaseOrderItemInput(name="Chicken", quantity=Decimal("5"), unit_price=Decimal("8"), inventory_item_id=inventory_item_id)],
        ),
    )
    item_id = po.items[0]["id"]
    await purchasing.acknowledge(tenant, SupplierAcknowledgementCreate(purchase_order_id=po.id, vendor_id=vendor_id, status="accepted"))
    receipt = await purchasing.receive_goods(
        tenant,
        GoodsReceiptCreate(
            purchase_order_id=po.id,
            vendor_id=vendor_id,
            items=[GoodsReceiptItemInput(purchase_order_item_id=item_id, inventory_item_id=inventory_item_id, received_quantity=Decimal("5"))],
        ),
    )
    invoice = await purchasing.create_invoice(
        tenant,
        SupplierInvoiceCreate(
            vendor_id=vendor_id,
            purchase_order_id=po.id,
            goods_receipt_id=receipt["id"],
            invoice_number="REL-1",
            items=[SupplierInvoiceItemInput(purchase_order_item_id=item_id, name="Chicken", quantity=Decimal("5"), unit_price=Decimal("8"))],
        ),
    )
    match = purchasing.reconcile(po.items, [{"purchase_order_item_id": item_id, "received_quantity": "5"}], [{"purchase_order_item_id": item_id, "name": "Chicken", "quantity": "5", "unit_price": "8"}])
    margin = MarginService().calculate_snapshot(MarginInputs(theoretical_food_cost=Decimal("32"), purchased_cost=Decimal("40"), received_cost=Decimal("40"), invoiced_cost=Decimal("40"), revenue=Decimal("160")))
    outcome = MarginService().calculate_outcome({"cost": recommendation.expected_cost, "savings": recommendation.expected_savings or Decimal("0"), "quantity": Decimal("5")}, {"cost": Decimal("40"), "savings": Decimal("0"), "received_quantity": Decimal("5"), "service_level_hit": True})

    assert import_result.canonical_counts["sales_transactions"] == 2
    assert forecast.items
    assert recommendation.selected_allocations
    assert decision.policy_result == "AUTO_EXECUTE_ALLOWED"
    assert action.state == "queued"
    assert invoice["total"] == "40"
    assert match.status == "MATCHED"
    assert margin.realized_food_cost == Decimal("40.00")
    assert outcome.quantity_variance == Decimal("0.00")
    inserted_tables = {table for table, _row in client.inserts}
    assert {"raw_imports", "import_receipts", "decision_evidence", "actions", "action_attempts", "purchase_orders", "goods_receipts", "supplier_invoices"} <= inserted_tables
