from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

AutonomyMode = Literal["RECOMMEND_ONLY", "APPROVAL_REQUIRED", "AUTO_EXECUTE"]
PolicyResult = Literal["AUTO_EXECUTE_ALLOWED", "APPROVAL_REQUIRED", "BLOCKED"]


class PolicyRule(BaseModel):
    rule_type: str
    operator: str = "<="
    value: dict[str, Any]
    effect: Literal["ALLOW", "APPROVAL_REQUIRED", "BLOCK"]


class Policy(BaseModel):
    id: UUID | None = None
    name: str
    autonomy_mode: AutonomyMode
    rules: list[PolicyRule] = []
    enabled: bool = True


class DecisionInput(BaseModel):
    trigger_type: str
    subject_type: str
    subject_id: UUID | None = None
    decision_type: str
    title: str
    proposed_action: dict[str, Any]
    evidence: dict[str, Any]
    confidence: Decimal
    idempotency_key: str
    created_by_agent: str = "Procurement Agent"


class PolicyEvaluation(BaseModel):
    result: PolicyResult
    matched_rules: list[str] = []
    reasons: list[str] = []


class DecisionRecord(BaseModel):
    id: UUID
    title: str
    decision_type: str
    proposed_action: dict[str, Any]
    confidence: Decimal
    policy_result: str
    status: str
    created_by_agent: str | None = None
    created_at: datetime | None = None
    evidence: list[dict[str, Any]] = []
    approvals: list[dict[str, Any]] = []
    actions: list[dict[str, Any]] = []


class ActionRequest(BaseModel):
    decision_id: UUID | None = None
    provider: str
    action_type: str
    payload: dict[str, Any]
    idempotency_key: str


class ActionRecord(BaseModel):
    id: UUID
    provider: str
    action_type: str
    payload: dict[str, Any]
    state: str
    idempotency_key: str
    failure_reason: str | None = None
    attempts: list[dict[str, Any]] = []


class AgentCenterSummary(BaseModel):
    active_agents: int
    tasks_executed: int
    policy_compliance: Decimal | None = None
    time_saved_hours: Decimal | None = None
    actions_executed: int
    savings_captured: Decimal | None = None
    tasks: list[dict[str, Any]]
    activity_feed: list[dict[str, Any]]
    policy_boundaries: list[dict[str, Any]]
    autonomy_level: str
    exception_watchlist: list[dict[str, Any]]
