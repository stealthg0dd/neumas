from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class ControlCenterKPI(BaseModel):
    key: str
    label: str
    value: float | int | str | None = None
    unit: str | None = None
    status: Literal["good", "watch", "risk", "neutral", "unknown"] = "unknown"
    evidence: list[str] = []


class ControlCenterAction(BaseModel):
    id: str
    title: str
    category: str
    priority: Literal["P0", "P1", "P2"] = "P2"
    what_changed: str
    impact: str | None = None
    evidence: list[str] = []
    recommended_action: str
    approval_required: bool = False
    status: str = "open"
    href: str | None = None
    confidence: float | None = None
    metadata: dict[str, Any] = {}


class ControlCenterDemandSummary(BaseModel):
    forecast_confidence: float | None = None
    stock_risk_count: int = 0
    next_7_day_purchase_need: float | None = None
    history_days_observed: int = 0
    learning_state: str | None = None
    evidence: list[str] = []


class ControlCenterMarginSummary(BaseModel):
    food_cost_pct: float | None = None
    margin_at_risk: float | None = None
    savings_captured: float | None = None
    evidence: list[str] = []


class ControlCenterSupplierSummary(BaseModel):
    supplier_otif: float | None = None
    supplier_count: int = 0
    price_alert_count: int = 0
    evidence: list[str] = []


class ControlCenterSummary(BaseModel):
    generated_at: datetime
    organization_id: str
    property_id: str
    kpis: list[ControlCenterKPI]
    risks: list[ControlCenterAction]
    recommendations: list[ControlCenterAction]
    open_approvals: list[ControlCenterAction]
    exceptions: list[ControlCenterAction]
    demand_summary: ControlCenterDemandSummary
    margin_summary: ControlCenterMarginSummary
    supplier_summary: ControlCenterSupplierSummary
    recent_actions: list[ControlCenterAction]
