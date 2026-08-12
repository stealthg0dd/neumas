from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DecisionActionCard(BaseModel):
    priority: Literal["P0", "P1", "P2"]
    action_type: str
    title: str
    detail: str
    value: str | None = None
    confidence: float | None = None
    cta_label: str
    cta_href: str


class DecisionLatestActivity(BaseModel):
    title: str
    detail: str
    status: str
    scan_id: str | None = None
    document_count: int | None = None
    items_updated: int | None = None
    supplier_name: str | None = None
    invoice_total: float | None = None
    canonicalization_status: str | None = None
    downstream_status: str | None = None


class DecisionAheadState(BaseModel):
    stock_risk_count: int
    next_7_day_purchase_need: float | None = None
    waste_risk_count: int | None = None
    forecast_confidence: float | None = None
    learning_state: str | None = None


class DecisionImpactState(BaseModel):
    mode: Literal["baseline", "measured"]
    headline: str
    metrics: list[dict] = []
    methodology_note: str | None = None
    stockouts_avoided: int | None = None
    waste_avoided: float | None = None
    purchasing_variance: float | None = None
    decisions_automated: int | None = None


class DecisionNextBestAction(BaseModel):
    action_type: str
    title: str
    detail: str
    cta_label: str
    cta_href: str


class DecisionCenterResponse(BaseModel):
    generated_at: datetime
    workspace_experience: str
    action_queue: list[DecisionActionCard]
    latest_activity: DecisionLatestActivity | None = None
    ahead: DecisionAheadState
    impact: DecisionImpactState
    next_best_action: DecisionNextBestAction
