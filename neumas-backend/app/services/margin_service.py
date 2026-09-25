from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.api.deps import TenantContext
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.margin import (
    MarginDashboardSummary,
    MarginInputs,
    MarginSnapshotResult,
    OutcomeLearningResult,
    WasteEventCreate,
)
from app.services.inventory_ledger_service import InventoryLedgerService


def q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class MarginService:
    def __init__(self) -> None:
        self.ledger = InventoryLedgerService()

    def calculate_snapshot(self, inputs: MarginInputs, *, scope_type: str = "property", scope_id=None, snapshot_date: date | None = None) -> MarginSnapshotResult:
        realized = inputs.invoiced_cost or inputs.received_cost or inputs.purchased_cost
        leakage = (
            max(Decimal("0"), inputs.invoiced_cost - inputs.theoretical_food_cost)
            + max(Decimal("0"), inputs.waste_cost)
            + max(Decimal("0"), inputs.supplier_variance)
            + max(Decimal("0"), inputs.invoice_variance)
        )
        food_cost_pct = q2((realized / inputs.revenue) * Decimal("100")) if inputs.revenue > 0 else None
        drivers = self.attribute_leakage(inputs)
        return MarginSnapshotResult(scope_type=scope_type, scope_id=scope_id, snapshot_date=snapshot_date or date.today(), food_cost_pct=food_cost_pct, realized_food_cost=q2(realized), margin_leakage=q2(leakage), drivers=drivers)

    def attribute_leakage(self, inputs: MarginInputs) -> list[dict[str, Any]]:
        drivers: list[dict[str, Any]] = []
        mapping = [
            ("supplier_price_increase", inputs.supplier_variance),
            ("invoice_discrepancy", inputs.invoice_variance),
            ("waste", inputs.waste_cost),
            ("unplanned_purchasing", max(Decimal("0"), inputs.purchased_cost - inputs.forecast_food_cost)),
            ("delivery_discrepancy", max(Decimal("0"), inputs.received_cost - inputs.purchased_cost)),
        ]
        for leakage_type, amount in mapping:
            if amount > 0:
                drivers.append({"type": leakage_type, "amount": q2(amount), "confidence": "evidence_backed"})
        if not drivers and inputs.invoiced_cost > inputs.theoretical_food_cost:
            drivers.append({"type": "UNKNOWN", "amount": q2(inputs.invoiced_cost - inputs.theoretical_food_cost), "confidence": "insufficient_evidence"})
        return drivers

    async def create_waste_event(self, tenant: TenantContext, payload: WasteEventCreate) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        resp = await client.table("waste_events").insert({
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "waste_type": payload.waste_type,
            "canonical_ingredient_id": str(payload.canonical_ingredient_id) if payload.canonical_ingredient_id else None,
            "inventory_item_id": str(payload.inventory_item_id) if payload.inventory_item_id else None,
            "quantity": str(payload.quantity),
            "uom": payload.uom,
            "cost": str(payload.cost) if payload.cost is not None else None,
            "reason": payload.reason,
            "source": payload.source,
            "event_date": payload.event_date.isoformat(),
            "created_by_id": str(tenant.user_id),
        }).execute()
        row = resp.data[0]
        if payload.inventory_item_id:
            await self.ledger.record_waste(tenant, payload.inventory_item_id, float(payload.quantity), payload.uom, notes=payload.reason, idempotency_key=f"waste:{row['id']}")
        return row

    def calculate_outcome(self, expected: dict[str, Decimal], actual: dict[str, Decimal | bool]) -> OutcomeLearningResult:
        cost_variance = Decimal(str(actual.get("cost", 0))) - expected.get("cost", Decimal("0"))
        savings_variance = Decimal(str(actual.get("savings", 0))) - expected.get("savings", Decimal("0"))
        quantity_variance = Decimal(str(actual.get("received_quantity", 0))) - expected.get("quantity", Decimal("0"))
        policy_changes = []
        if cost_variance > expected.get("cost", Decimal("0")) * Decimal("0.1"):
            policy_changes.append({"rule": "max_supplier_price_variance_pct", "reason": "actual cost exceeded expected by more than 10%"})
        if actual.get("stockout_occurred"):
            policy_changes.append({"rule": "safety_stock", "reason": "stockout occurred after decision"})
        return OutcomeLearningResult(cost_variance=q2(cost_variance), savings_variance=q2(savings_variance), quantity_variance=q2(quantity_variance), service_level_hit=bool(actual.get("service_level_hit")) if "service_level_hit" in actual else None, stockout_occurred=bool(actual.get("stockout_occurred")) if "stockout_occurred" in actual else None, waste_impact=Decimal(str(actual["waste_impact"])) if "waste_impact" in actual else None, recommended_policy_changes=policy_changes)

    async def dashboard(self, tenant: TenantContext) -> MarginDashboardSummary:
        client = await get_async_supabase_admin()
        snapshots = await self._fetch(client, "margin_snapshots", tenant)
        waste = await self._fetch(client, "waste_events", tenant)
        latest = snapshots[0] if snapshots else {}
        return MarginDashboardSummary(
            generated_at=datetime.now(UTC),
            top_metrics={
                "food_cost_pct": self._dec(latest.get("food_cost_pct")),
                "food_cost_vs_target": None,
                "margin_at_risk": self._dec(latest.get("margin_leakage")),
                "savings_captured": None,
                "supplier_leakage": self._dec(latest.get("supplier_variance")),
                "waste_cost": sum((self._dec(row.get("cost")) or Decimal("0") for row in waste), Decimal("0")),
                "invoice_recovery": self._dec(latest.get("invoice_variance")),
                "procurement_efficiency": None,
            },
            leakage_waterfall=latest.get("drivers") or [],
            cost_trend=snapshots,
            supplier_impact=[],
            category_impact=[],
            top_opportunities=latest.get("drivers") or [],
            savings_realized_vs_projected=[],
            waste_events=waste,
        )

    async def _fetch(self, client: Any, table: str, tenant: TenantContext) -> list[dict[str, Any]]:
        resp = await client.table(table).select("*").eq("organization_id", str(tenant.org_id)).eq("property_id", str(tenant.property_id)).order("created_at", desc=True).limit(100).execute()
        return resp.data or []

    def _dec(self, value: Any) -> Decimal | None:
        return Decimal(str(value)) if value is not None else None
