from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class MarginInputs(BaseModel):
    theoretical_food_cost: Decimal = Decimal("0")
    forecast_food_cost: Decimal = Decimal("0")
    purchased_cost: Decimal = Decimal("0")
    received_cost: Decimal = Decimal("0")
    invoiced_cost: Decimal = Decimal("0")
    actual_consumption_cost: Decimal = Decimal("0")
    waste_cost: Decimal = Decimal("0")
    supplier_variance: Decimal = Decimal("0")
    invoice_variance: Decimal = Decimal("0")
    revenue: Decimal = Decimal("0")


class MarginSnapshotResult(BaseModel):
    scope_type: str
    scope_id: UUID | None = None
    snapshot_date: date
    food_cost_pct: Decimal | None = None
    realized_food_cost: Decimal
    margin_leakage: Decimal
    drivers: list[dict[str, Any]]


class WasteEventCreate(BaseModel):
    waste_type: str
    canonical_ingredient_id: UUID | None = None
    inventory_item_id: UUID | None = None
    quantity: Decimal
    uom: str = "unit"
    cost: Decimal | None = None
    reason: str | None = None
    source: str | None = None
    event_date: date


class OutcomeLearningResult(BaseModel):
    cost_variance: Decimal
    savings_variance: Decimal
    quantity_variance: Decimal
    service_level_hit: bool | None = None
    stockout_occurred: bool | None = None
    waste_impact: Decimal | None = None
    recommended_policy_changes: list[dict[str, Any]]


class MarginDashboardSummary(BaseModel):
    generated_at: datetime
    top_metrics: dict[str, Decimal | None]
    leakage_waterfall: list[dict[str, Any]]
    cost_trend: list[dict[str, Any]]
    supplier_impact: list[dict[str, Any]]
    category_impact: list[dict[str, Any]]
    top_opportunities: list[dict[str, Any]]
    savings_realized_vs_projected: list[dict[str, Any]]
    waste_events: list[dict[str, Any]]
