from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.constants import ACTIVE_OPERATIONAL_FORECAST_TYPE
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.services.entitlement_service import EntitlementService

logger = get_logger(__name__)

MIN_EVIDENCE_CYCLES = 3


@dataclass(slots=True)
class ForecastEligibilityResult:
    status: str
    reason_code: str
    evidence_cycles_available: int
    evidence_cycles_required: int
    last_forecast_at: str | None
    next_eligible_at: str | None
    detail: str = ""
    forecast_running: bool = False
    cadence_hours: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "reason_code": self.reason_code,
            "evidence_cycles_available": self.evidence_cycles_available,
            "evidence_cycles_required": self.evidence_cycles_required,
            "last_forecast_at": self.last_forecast_at,
            "next_eligible_at": self.next_eligible_at,
            "detail": self.detail,
            "forecast_running": self.forecast_running,
            "cadence_hours": self.cadence_hours,
        }


class ForecastEligibilityService:
    """Canonical forecast eligibility and cadence evaluation."""

    def __init__(self) -> None:
        self._entitlements = EntitlementService()

    async def evaluate_forecast_eligibility(
        self,
        org_id: UUID,
        property_id: UUID,
        *,
        role: str = "service",
        user_id: UUID | None = None,
        ignore_freshness: bool = False,
    ) -> ForecastEligibilityResult:
        client = await get_async_supabase_admin()
        if client is None:
            return ForecastEligibilityResult(
                status="blocked",
                reason_code="INSUFFICIENT_TIME_SERIES",
                evidence_cycles_available=0,
                evidence_cycles_required=MIN_EVIDENCE_CYCLES,
                last_forecast_at=None,
                next_eligible_at=None,
                detail="admin_client_unavailable",
            )

        tenant = TenantContext(
            user_id=user_id or UUID("00000000-0000-0000-0000-000000000001"),
            org_id=org_id,
            property_id=property_id,
            role=role,
            jwt="",
        )
        entitlements = await self._entitlements.get_for_tenant(tenant)
        cadence_hours = entitlements.limits.forecast_frequency_hours

        docs_resp = await (
            client.table("scans")
            .select("id, created_at", count="exact")
            .eq("organization_id", str(org_id))
            .eq("property_id", str(property_id))
            .in_("status", ["inventory_posted", "completed", "completed_with_partial_analysis", "partial_failed"])
            .execute()
        )
        evidence_cycles = int(docs_resp.count or len(docs_resp.data or []))
        if evidence_cycles < MIN_EVIDENCE_CYCLES:
            return ForecastEligibilityResult(
                status="blocked",
                reason_code="INSUFFICIENT_DOCUMENTS",
                evidence_cycles_available=evidence_cycles,
                evidence_cycles_required=MIN_EVIDENCE_CYCLES,
                last_forecast_at=None,
                next_eligible_at=None,
                detail="waiting_for_more_purchase_documents",
                cadence_hours=cadence_hours,
            )

        movements_resp = await (
            client.table("inventory_movements")
            .select("id", count="exact")
            .eq("organization_id", str(org_id))
            .eq("property_id", str(property_id))
            .execute()
        )
        movement_count = int(movements_resp.count or len(movements_resp.data or []))
        if movement_count == 0:
            return ForecastEligibilityResult(
                status="blocked",
                reason_code="NO_LEDGER_MOVEMENTS",
                evidence_cycles_available=evidence_cycles,
                evidence_cycles_required=MIN_EVIDENCE_CYCLES,
                last_forecast_at=None,
                next_eligible_at=None,
                detail="inventory_ledger_has_no_movements",
                cadence_hours=cadence_hours,
            )

        patterns_resp = await (
            client.table("consumption_patterns")
            .select("id, sample_size")
            .eq("organization_id", str(org_id))
            .eq("property_id", str(property_id))
            .eq("pattern_type", "daily")
            .execute()
        )
        pattern_rows = patterns_resp.data or []
        eligible_patterns = [row for row in pattern_rows if int(row.get("sample_size") or 0) >= MIN_EVIDENCE_CYCLES]
        if not eligible_patterns:
            return ForecastEligibilityResult(
                status="blocked",
                reason_code="INSUFFICIENT_TIME_SERIES",
                evidence_cycles_available=evidence_cycles,
                evidence_cycles_required=MIN_EVIDENCE_CYCLES,
                last_forecast_at=None,
                next_eligible_at=None,
                detail="daily_patterns_not_mature",
                cadence_hours=cadence_hours,
            )

        inventory_resp = await (
            client.table("inventory_items")
            .select("id, canonical_item_id")
            .eq("organization_id", str(org_id))
            .eq("property_id", str(property_id))
            .eq("is_active", True)
            .execute()
        )
        inventory_rows = inventory_resp.data or []
        if not inventory_rows or not any(row.get("canonical_item_id") for row in inventory_rows):
            return ForecastEligibilityResult(
                status="blocked",
                reason_code="MISSING_CANONICAL_ITEMS",
                evidence_cycles_available=evidence_cycles,
                evidence_cycles_required=MIN_EVIDENCE_CYCLES,
                last_forecast_at=None,
                next_eligible_at=None,
                detail="canonical_item_links_missing",
                cadence_hours=cadence_hours,
            )

        scans_resp = await (
            client.table("scans")
            .select("id, status, processed_results")
            .eq("organization_id", str(org_id))
            .eq("property_id", str(property_id))
            .eq("status", "inventory_posted")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if scans_resp.data:
            return ForecastEligibilityResult(
                status="queued",
                reason_code="FORECAST_RUNNING",
                evidence_cycles_available=evidence_cycles,
                evidence_cycles_required=MIN_EVIDENCE_CYCLES,
                last_forecast_at=None,
                next_eligible_at=None,
                detail="post_scan_workflow_in_progress",
                forecast_running=True,
                cadence_hours=cadence_hours,
            )

        last_prediction_resp = await (
            client.table("predictions")
            .select("generated_at, created_at")
            .eq("organization_id", str(org_id))
            .eq("property_id", str(property_id))
            .eq("prediction_type", ACTIVE_OPERATIONAL_FORECAST_TYPE)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        )
        last_prediction = (last_prediction_resp.data or [None])[0]
        last_forecast_at = None
        next_eligible_at = None
        if last_prediction:
            last_forecast_at = str(last_prediction.get("generated_at") or last_prediction.get("created_at") or "")
            if cadence_hours and last_forecast_at and not ignore_freshness:
                try:
                    last_dt = datetime.fromisoformat(last_forecast_at.replace("Z", "+00:00"))
                    next_dt = last_dt + timedelta(hours=cadence_hours)
                    next_eligible_at = next_dt.isoformat()
                    if next_dt > datetime.now(UTC):
                        return ForecastEligibilityResult(
                            status="blocked",
                            reason_code="ALREADY_FRESH",
                            evidence_cycles_available=evidence_cycles,
                            evidence_cycles_required=MIN_EVIDENCE_CYCLES,
                            last_forecast_at=last_forecast_at,
                            next_eligible_at=next_eligible_at,
                            detail="forecast_within_plan_cadence",
                            cadence_hours=cadence_hours,
                        )
                except ValueError:
                    pass

        return ForecastEligibilityResult(
            status="eligible",
            reason_code="ELIGIBLE",
            evidence_cycles_available=evidence_cycles,
            evidence_cycles_required=MIN_EVIDENCE_CYCLES,
            last_forecast_at=last_forecast_at,
            next_eligible_at=next_eligible_at,
            detail="forecast_can_run",
            cadence_hours=cadence_hours,
        )
