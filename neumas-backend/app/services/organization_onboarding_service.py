from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)

OnboardingStage = Literal[
    "ACCOUNT_CREATED",
    "ORGANIZATION_CREATED",
    "LOCATION_CREATED",
    "OPERATING_PROFILE_SET",
    "DATA_SOURCE_SELECTED",
    "DATA_CONNECTED",
    "BASELINE_PROCESSING",
    "READY",
]

STAGE_ORDER: list[OnboardingStage] = [
    "ACCOUNT_CREATED",
    "ORGANIZATION_CREATED",
    "LOCATION_CREATED",
    "OPERATING_PROFILE_SET",
    "DATA_SOURCE_SELECTED",
    "DATA_CONNECTED",
    "BASELINE_PROCESSING",
    "READY",
]


class OrganizationOnboardingService:
    """Owns durable onboarding stage transitions for an organization."""

    async def upsert_snapshot(
        self,
        *,
        organization_id: UUID | str,
        property_id: UUID | str | None,
        stage: OnboardingStage | str,
        completed_steps: list[str],
        missing_requirements: list[str],
        operating_profile: dict[str, Any] | None = None,
        completed_at: str | None = None,
        client: Any | None = None,
    ) -> None:
        client = client or await get_async_supabase_admin()
        organization_id_str = str(organization_id)
        current = await self._get_current(client, organization_id_str)
        current_stage = str((current or {}).get("stage") or "ACCOUNT_CREATED")
        next_stage = self._max_stage(current_stage, str(stage))
        merged_profile = {
            **self._dict_or_empty((current or {}).get("operating_profile")),
            **(operating_profile or {}),
        }
        merged_steps = self._merge_steps(
            self._list_or_empty((current or {}).get("completed_steps")),
            completed_steps,
            next_stage,
        )
        payload: dict[str, Any] = {
            "organization_id": organization_id_str,
            "property_id": str(property_id) if property_id else (current or {}).get("property_id"),
            "stage": next_stage,
            "completed_steps": merged_steps,
            "missing_requirements": missing_requirements,
            "operating_profile": merged_profile,
        }
        if completed_at is not None:
            payload["completed_at"] = completed_at
        elif next_stage == "READY" and not (current or {}).get("completed_at"):
            payload["completed_at"] = datetime.now(UTC).isoformat()

        await (
            client.table("organization_onboarding")
            .upsert(payload, on_conflict="organization_id")
            .execute()
        )

    async def sync_from_readiness(
        self,
        tenant: TenantContext,
        readiness: Any,
        *,
        client: Any | None = None,
    ) -> None:
        client = client or await get_async_supabase_admin()
        current = await self._get_current(client, str(tenant.org_id))
        profile = self._dict_or_empty((current or {}).get("operating_profile"))
        stage = self._derive_stage(
            has_property=tenant.property_id is not None,
            operating_profile=profile,
            readiness=readiness,
        )
        await self.upsert_snapshot(
            organization_id=tenant.org_id,
            property_id=tenant.property_id,
            stage=stage,
            completed_steps=self._steps_for_stage(stage),
            missing_requirements=list(getattr(readiness, "blockers", []) or []),
            operating_profile=profile,
            client=client,
        )

    async def _get_current(self, client: Any, organization_id: str) -> dict[str, Any] | None:
        try:
            response = await (
                client.table("organization_onboarding")
                .select("*")
                .eq("organization_id", organization_id)
                .limit(1)
                .execute()
            )
            return (response.data or [None])[0]
        except Exception as exc:
            logger.warning(
                "Organization onboarding lookup skipped",
                organization_id=organization_id,
                error=str(exc),
            )
            return None

    def _derive_stage(
        self,
        *,
        has_property: bool,
        operating_profile: dict[str, Any],
        readiness: Any,
    ) -> OnboardingStage:
        if not has_property:
            return "ORGANIZATION_CREATED"

        stage: OnboardingStage = "LOCATION_CREATED"
        profile_has_operating_fields = any(
            operating_profile.get(key)
            for key in (
                "business_type",
                "country",
                "currency",
                "outlet_count",
                "property_type",
                "data_start_choice",
            )
        )
        if profile_has_operating_fields:
            stage = "OPERATING_PROFILE_SET"

        if operating_profile.get("data_start_choice") or self._has_any_data(readiness):
            stage = "DATA_SOURCE_SELECTED"
        if self._has_any_data(readiness):
            stage = "DATA_CONNECTED"
        if self._has_baseline_processing(readiness):
            stage = "BASELINE_PROCESSING"
        if getattr(readiness, "overall_readiness", None) == "READY":
            stage = "READY"
        return stage

    @staticmethod
    def _has_any_data(readiness: Any) -> bool:
        for attr in (
            "sales_data",
            "inventory_data",
            "supplier_data",
            "recipe_data",
            "invoice_data",
            "purchase_order_data",
        ):
            item = getattr(readiness, attr, None)
            if item and int(getattr(item, "record_count", 0) or 0) > 0:
                return True
        return False

    @staticmethod
    def _has_baseline_processing(readiness: Any) -> bool:
        for attr in ("forecast_ready", "procurement_ready", "margin_ready"):
            item = getattr(readiness, attr, None)
            if item and getattr(item, "status", "MISSING") in {"READY", "PARTIAL"}:
                return True
        return False

    def _max_stage(self, current: str, requested: str) -> OnboardingStage:
        current_stage = current if current in STAGE_ORDER else "ACCOUNT_CREATED"
        requested_stage = requested if requested in STAGE_ORDER else "ACCOUNT_CREATED"
        return STAGE_ORDER[max(STAGE_ORDER.index(current_stage), STAGE_ORDER.index(requested_stage))]

    def _steps_for_stage(self, stage: OnboardingStage) -> list[str]:
        return STAGE_ORDER[: STAGE_ORDER.index(stage) + 1]

    def _merge_steps(
        self,
        current_steps: list[str],
        requested_steps: list[str],
        stage: OnboardingStage,
    ) -> list[str]:
        merged = {step for step in current_steps + requested_steps if step in STAGE_ORDER}
        merged.update(self._steps_for_stage(stage))
        return [step for step in STAGE_ORDER if step in merged]

    @staticmethod
    def _dict_or_empty(value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _list_or_empty(value: Any) -> list[str]:
        return [str(item) for item in value] if isinstance(value, list) else []
