from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status

from app.api.deps import TenantContext
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.entitlements import (
    EntitlementFlags,
    EntitlementLimits,
    EntitlementResponse,
)

_PLAN_MATRIX: dict[str, EntitlementResponse] = {
    "HOME_FREE": EntitlementResponse(
        plan_code="HOME_FREE",
        limits=EntitlementLimits(monthly_scans=60, users=2, properties=1, history_days=90, forecast_frequency_hours=24),
        features=EntitlementFlags(),
    ),
    "HOME_PLUS": EntitlementResponse(
        plan_code="HOME_PLUS",
        limits=EntitlementLimits(monthly_scans=300, users=5, properties=2, history_days=365, forecast_frequency_hours=12),
        features=EntitlementFlags(reports=True, integrations=True, copilot=True, exports=True),
    ),
    "FNB_STARTER": EntitlementResponse(
        plan_code="FNB_STARTER",
        limits=EntitlementLimits(monthly_scans=500, users=5, properties=3, history_days=365, forecast_frequency_hours=12),
        features=EntitlementFlags(reports=True, exports=True),
    ),
    "FNB_GROWTH": EntitlementResponse(
        plan_code="FNB_GROWTH",
        limits=EntitlementLimits(monthly_scans=5000, users=25, properties=20, history_days=730, forecast_frequency_hours=4),
        features=EntitlementFlags(reports=True, integrations=True, copilot=True, approval_workflows=True, exports=True, vendor_analytics=True),
    ),
    "FNB_ENTERPRISE": EntitlementResponse(
        plan_code="FNB_ENTERPRISE",
        limits=EntitlementLimits(monthly_scans=None, users=None, properties=None, history_days=None, forecast_frequency_hours=1),
        features=EntitlementFlags(reports=True, integrations=True, copilot=True, approval_workflows=True, exports=True, vendor_analytics=True),
    ),
    "INTERNAL_ADMIN": EntitlementResponse(
        plan_code="INTERNAL_ADMIN",
        limits=EntitlementLimits(monthly_scans=None, users=None, properties=None, history_days=None, forecast_frequency_hours=1),
        features=EntitlementFlags(reports=True, integrations=True, copilot=True, approval_workflows=True, exports=True, vendor_analytics=True),
    ),
}


class EntitlementService:
    async def get_for_tenant(self, tenant: TenantContext) -> EntitlementResponse:
        client = await get_async_supabase_admin()
        org = await (
            client.table("organizations")
            .select("id, plan, org_type, subscription_status")
            .eq("id", str(tenant.org_id))
            .single()
            .execute()
        )
        row = org.data or {}
        legacy_plan = str(row.get("plan") or "").strip() or None
        org_type = (row.get("org_type") or "").strip() or None
        plan_code = self._resolve_plan_code(legacy_plan, org_type, tenant)
        base = _PLAN_MATRIX[plan_code].model_copy(deep=True)
        base.legacy_plan = legacy_plan
        base.org_type = org_type
        base.grandfathered = bool(legacy_plan and legacy_plan.upper() not in _PLAN_MATRIX)
        base.billing_state = str(row.get("subscription_status") or "active")
        return base

    def _resolve_plan_code(self, legacy_plan: str | None, org_type: str | None, tenant: TenantContext) -> str:
        normalized = (legacy_plan or "").strip().upper()
        if normalized in _PLAN_MATRIX:
            return normalized
        if normalized == "FREE":
            return "HOME_FREE" if (org_type or "").upper() == "HOUSEHOLD" else "FNB_STARTER"
        if normalized in {"PILOT", "PRO"}:
            return "HOME_PLUS" if (org_type or "").upper() == "HOUSEHOLD" else "FNB_GROWTH"
        if normalized == "ENTERPRISE":
            return "FNB_ENTERPRISE"
        if tenant.role == "service":
            return "INTERNAL_ADMIN"
        return "HOME_FREE" if (org_type or "").upper() == "HOUSEHOLD" else "FNB_STARTER"

    async def require_feature(self, tenant: TenantContext, feature: str, message: str) -> EntitlementResponse:
        entitlements = await self.get_for_tenant(tenant)
        if not getattr(entitlements.features, feature):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)
        return entitlements

    async def enforce_monthly_scans(self, tenant: TenantContext) -> EntitlementResponse:
        entitlements = await self.get_for_tenant(tenant)
        limit = entitlements.limits.monthly_scans
        if limit is None:
            return entitlements
        client = await get_async_supabase_admin()
        since = (datetime.now(UTC) - timedelta(days=30)).isoformat()
        response = await (
            client.table("scans")
            .select("id", count="exact")
            .eq("organization_id", str(tenant.org_id))
            .gte("created_at", since)
            .execute()
        )
        if int(response.count or 0) >= limit:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Monthly scan limit reached for your plan.")
        return entitlements

    async def enforce_forecast_frequency(self, tenant: TenantContext, property_id: UUID) -> EntitlementResponse:
        entitlements = await self.get_for_tenant(tenant)
        hours = entitlements.limits.forecast_frequency_hours
        if hours is None:
            return entitlements
        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()
        response = await (
            client.table("predictions")
            .select("id")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(property_id))
            .gte("created_at", cutoff)
            .limit(1)
            .execute()
        )
        if response.data:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Forecasts on your plan can run once every {hours} hours.",
            )
        return entitlements
