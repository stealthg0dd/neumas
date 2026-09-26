from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ReadinessStatus = Literal["READY", "PARTIAL", "MISSING"]


class DataReadinessItem(BaseModel):
    status: ReadinessStatus
    record_count: int = 0
    last_updated: datetime | None = None
    required_action: str


class DataReadinessResponse(BaseModel):
    organization_id: str
    property_id: str | None = None
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
