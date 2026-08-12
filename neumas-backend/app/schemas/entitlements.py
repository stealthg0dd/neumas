from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

PlanCode = Literal[
    "HOME_FREE",
    "HOME_PLUS",
    "FNB_STARTER",
    "FNB_GROWTH",
    "FNB_ENTERPRISE",
    "INTERNAL_ADMIN",
]


class EntitlementLimits(BaseModel):
    monthly_scans: int | None = None
    users: int | None = None
    properties: int | None = None
    history_days: int | None = None
    forecast_frequency_hours: int | None = None


class EntitlementFlags(BaseModel):
    reports: bool = False
    integrations: bool = False
    copilot: bool = False
    approval_workflows: bool = False
    exports: bool = False
    vendor_analytics: bool = False


class EntitlementResponse(BaseModel):
    plan_code: PlanCode
    legacy_plan: str | None = None
    org_type: str | None = None
    grandfathered: bool = False
    billing_state: str = "active"
    limits: EntitlementLimits
    features: EntitlementFlags
