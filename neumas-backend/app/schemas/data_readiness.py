from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ReadinessStatus = Literal["READY", "PARTIAL", "MISSING"]
ReadinessTier = Literal["TIER_0", "TIER_1", "TIER_2", "TIER_3", "TIER_4"]


class DataReadinessItem(BaseModel):
    status: ReadinessStatus
    record_count: int = 0
    last_updated: datetime | None = None
    required_action: str


class DataReadinessResponse(BaseModel):
    organization_id: str
    property_id: str | None = None
    overall_readiness: ReadinessStatus
    readiness_tier: ReadinessTier | None = None
    capability_readiness: dict[str, ReadinessStatus] = Field(default_factory=dict)
    sales_data: DataReadinessItem
    inventory_data: DataReadinessItem
    supplier_data: DataReadinessItem
    recipe_data: DataReadinessItem
    invoice_data: DataReadinessItem
    purchase_order_data: DataReadinessItem
    demand_history: DataReadinessItem
    forecast_ready: DataReadinessItem
    procurement_ready: DataReadinessItem
    margin_ready: DataReadinessItem
    blockers: list[str] = Field(default_factory=list)
