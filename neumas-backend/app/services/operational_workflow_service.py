"""
Post-scan operational workflow coordinator.

This service intentionally coordinates existing domain services without
re-implementing their business logic. It begins only after inventory-affecting
scan evidence has already been posted safely.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger, log_business_event
from app.db.supabase_client import get_async_supabase_admin
from app.services.alert_service import AlertService
from app.services.executive_briefing_service import ExecutiveBriefingService
from app.services.forecast_eligibility_service import ForecastEligibilityService
from app.services.reorder_service import ReorderService

logger = get_logger(__name__)


class OperationalWorkflowService:
    """Coordinate downstream post-scan refresh work."""

    def __init__(self) -> None:
        self._alerts = AlertService()
        self._briefing = ExecutiveBriefingService()
        self._forecast_eligibility = ForecastEligibilityService()
        self._reorder = ReorderService()

    async def run_post_scan_workflow(
        self,
        tenant: TenantContext,
        *,
        scan_id: UUID,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        """Run the additive downstream operational loop for a posted scan."""
        from app.services.pattern_agent import recompute_patterns_for_property
        from app.services.predict_agent import recompute_predictions_for_property

        workflow_started = time.perf_counter()
        client = await get_async_supabase_admin()
        if client is None:
            raise RuntimeError("Supabase admin client unavailable")

        scan = await self._get_scan(client, scan_id)
        processed = dict(scan.get("processed_results") or {})
        stage_details = dict(processed.get("stage_details") or {})
        stage_errors = list(processed.get("stage_errors") or [])

        if request_id and not stage_details.get("request_id"):
            stage_details["request_id"] = request_id

        if stage_details.get("downstream", {}).get("status") == "completed":
            return {
                "status": "completed",
                "scan_id": str(scan_id),
                "detail": "downstream_already_completed",
            }

        await self._persist_stage_state(
            client,
            scan_id,
            processed,
            stage_details=stage_details,
            stage_errors=stage_errors,
            status="processing",
            current_stage="downstream",
            stage_patch={"downstream": {"status": "running", "started_at": datetime.now(UTC).isoformat()}},
        )

        errors: list[dict[str, Any]] = []

        async def _run_stage(stage_key: str, coro):
            nonlocal stage_details, stage_errors, processed
            await self._persist_stage_state(
                client,
                scan_id,
                processed,
                stage_details=stage_details,
                stage_errors=stage_errors,
                current_stage=stage_key,
                stage_patch={stage_key: {"status": "running"}},
            )
            started = datetime.now(UTC)
            try:
                result = await coro
                elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
                payload = {"status": "completed", "elapsed_ms": elapsed_ms}
                if isinstance(result, dict):
                    payload.update(result)
                stage_details[stage_key] = payload
                await self._persist_stage_state(
                    client,
                    scan_id,
                    processed,
                    stage_details=stage_details,
                    stage_errors=stage_errors,
                    current_stage=stage_key,
                )
                return result
            except Exception as exc:  # pragma: no cover - exercised via callers
                elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
                payload = {"status": "failed", "elapsed_ms": elapsed_ms, "error": str(exc)}
                stage_details[stage_key] = payload
                error_row = {"stage": stage_key, "error": str(exc)}
                stage_errors.append(error_row)
                errors.append(error_row)
                await self._persist_stage_state(
                    client,
                    scan_id,
                    processed,
                    stage_details=stage_details,
                    stage_errors=stage_errors,
                    current_stage=stage_key,
                )
                logger.warning(
                    "Post-scan workflow stage failed",
                    scan_id=str(scan_id),
                    stage=stage_key,
                    error=str(exc),
                )
                return None

        baseline_result = await _run_stage(
            "baseline",
            recompute_patterns_for_property(tenant.property_id, org_id=str(tenant.org_id)),
        )
        eligibility_started = time.perf_counter()
        forecast_eligibility = await self._forecast_eligibility.evaluate_forecast_eligibility(
            tenant.org_id,
            tenant.property_id,
            role=tenant.role,
            user_id=tenant.user_id,
        )
        stage_details["forecast_eligibility"] = {
            **forecast_eligibility.to_dict(),
            "elapsed_ms": int((time.perf_counter() - eligibility_started) * 1000),
        }

        prediction_result = None
        if forecast_eligibility.reason_code == "ELIGIBLE":
            prediction_result = await _run_stage(
                "predictions",
                recompute_predictions_for_property(tenant.property_id),
            )
        else:
            stage_details["predictions"] = {
                "status": "skipped",
                "reason_code": forecast_eligibility.reason_code,
                "detail": forecast_eligibility.detail,
            }
            await self._persist_stage_state(
                client,
                scan_id,
                processed,
                stage_details=stage_details,
                stage_errors=stage_errors,
                current_stage="predictions",
            )
        reorder_result = await _run_stage(
            "reorder",
            self._reorder.create_or_update_reorder_plan(
                tenant,
                trigger_context={"source": "post_scan_workflow", "scan_id": str(scan_id)},
            ),
        )
        alerts_result = await _run_stage("alerts", self._alerts.evaluate_inventory(tenant))
        briefing_result = await _run_stage(
            "executive_insights",
            self._briefing.get_briefing(tenant, days=7, force_refresh=True),
        )

        next_action = self._derive_next_best_action(
            processed=processed,
            stage_details=stage_details,
            reorder_result=reorder_result,
            alerts_result=alerts_result,
        )
        stage_details["next_best_action"] = {
            **next_action,
            "elapsed_ms": int((time.perf_counter() - workflow_started) * 1000),
        }
        stage_details["workflow_timing"] = {
            "ledger_to_forecast_eligibility_ms": int(
                stage_details["forecast_eligibility"].get("elapsed_ms") or 0
            ),
            "forecast_to_recommendation_ms": int(
                (stage_details.get("predictions") or {}).get("elapsed_ms") or 0
            ) + int((stage_details.get("reorder") or {}).get("elapsed_ms") or 0),
            "recommendation_to_dashboard_action_ms": int(
                (stage_details["next_best_action"].get("elapsed_ms") or 0)
                - int((stage_details.get("reorder") or {}).get("elapsed_ms") or 0)
            ),
            "total_downstream_ms": int((time.perf_counter() - workflow_started) * 1000),
        }
        stage_details["downstream"] = {
            "status": "completed" if not errors else "partial_failed",
            "completed_at": datetime.now(UTC).isoformat(),
            "failed_stage_count": len(errors),
        }

        final_status = "completed" if not errors else "completed_with_partial_analysis"
        await self._persist_stage_state(
            client,
            scan_id,
            processed,
            stage_details=stage_details,
            stage_errors=stage_errors,
            status=final_status,
            current_stage="completed",
        )
        log_business_event(
            "scan.operational_workflow_completed",
            property_id=str(tenant.property_id),
            user_id=str(tenant.user_id),
            scan_id=str(scan_id),
            status=final_status,
            baseline_status=str((stage_details.get("baseline") or {}).get("status") or "unknown"),
            prediction_status=str((stage_details.get("predictions") or {}).get("status") or "unknown"),
            reorder_status=str((stage_details.get("reorder") or {}).get("status") or "unknown"),
            alert_status=str((stage_details.get("alerts") or {}).get("status") or "unknown"),
            ledger_to_forecast_eligibility_ms=stage_details["workflow_timing"]["ledger_to_forecast_eligibility_ms"],
            forecast_to_recommendation_ms=stage_details["workflow_timing"]["forecast_to_recommendation_ms"],
            recommendation_to_dashboard_action_ms=stage_details["workflow_timing"]["recommendation_to_dashboard_action_ms"],
            total_downstream_ms=stage_details["workflow_timing"]["total_downstream_ms"],
            error_count=len(errors),
        )

        return {
            "status": final_status,
            "scan_id": str(scan_id),
            "baseline": baseline_result,
            "predictions": prediction_result,
            "forecast_eligibility": forecast_eligibility.to_dict(),
            "reorder": reorder_result,
            "alerts_created": len(alerts_result or []),
            "briefing_log_count": int((briefing_result or {}).get("log_count") or 0),
            "errors": errors,
        }

    async def _get_scan(self, client: Any, scan_id: UUID) -> dict[str, Any]:
        response = await (
            client.table("scans")
            .select("id, status, processed_results")
            .eq("id", str(scan_id))
            .single()
            .execute()
        )
        return dict(response.data or {})

    async def _persist_stage_state(
        self,
        client: Any,
        scan_id: UUID,
        processed: dict[str, Any],
        *,
        stage_details: dict[str, Any],
        stage_errors: list[dict[str, Any]],
        status: str | None = None,
        current_stage: str | None = None,
        stage_patch: dict[str, Any] | None = None,
    ) -> None:
        merged_stage_details = dict(stage_details)
        if stage_patch:
            for key, value in stage_patch.items():
                existing = merged_stage_details.get(key)
                if isinstance(existing, dict) and isinstance(value, dict):
                    merged_stage_details[key] = {**existing, **value}
                else:
                    merged_stage_details[key] = value
        if current_stage:
            merged_stage_details["current_stage"] = current_stage
        payload = {
            "processed_results": {
                **processed,
                "stage_details": merged_stage_details,
                "stage_errors": stage_errors,
            }
        }
        if status is not None:
            payload["status"] = status
            if status in {"completed", "completed_with_partial_analysis"}:
                payload["completed_at"] = datetime.now(UTC).isoformat()
        await client.table("scans").update(payload).eq("id", str(scan_id)).execute()
        stage_details.clear()
        stage_details.update(merged_stage_details)

    def _derive_next_best_action(
        self,
        *,
        processed: dict[str, Any],
        stage_details: dict[str, Any],
        reorder_result: dict[str, Any] | None,
        alerts_result: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        items = list(processed.get("items") or [])
        if reorder_result and reorder_result.get("shopping_list_id"):
            return {
                "label": "Review the shopping plan",
                "href": "/dashboard/shopping",
                "detail": str(reorder_result.get("result_code") or "UPDATED"),
            }
        if alerts_result:
            return {
                "label": "Review stock alerts",
                "href": "/dashboard/alerts",
                "detail": f"{len(alerts_result)} alert(s) refreshed",
            }
        if items:
            return {
                "label": "See what Neumas found",
                "href": "/dashboard",
                "detail": f"{len(items)} item(s) processed",
            }
        return {
            "label": "Open scans",
            "href": "/dashboard/scans",
            "detail": "workflow_complete",
        }
