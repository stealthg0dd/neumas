from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class ImpactService:
    """Canonical auditable operator-value metrics for dashboard, reports, and briefings."""

    async def get_impact_summary(
        self,
        tenant: TenantContext,
        *,
        days: int = 30,
        workspace_experience: str = "FNB",
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        if client is None:
            return {
                "mode": "baseline",
                "headline": (
                    "Neumas is establishing your household baseline."
                    if workspace_experience == "HOUSEHOLD"
                    else "Neumas is establishing your operating baseline."
                ),
                "period_days": days,
                "generated_at": datetime.now(UTC).isoformat(),
                "metrics": [],
                "summary": {
                    "documents_processed": 0,
                    "line_items_processed": 0,
                    "line_items_auto_accepted": 0,
                    "manual_review_rate": None,
                    "reorder_recommendations_generated": 0,
                    "recommendation_acceptance_rate": None,
                    "operator_overrides": 0,
                    "completed_reorders": 0,
                    "forecast_accuracy": None,
                    "observed_price_variance": None,
                    "automated_workflow_actions": 0,
                    "estimated_admin_time_saved_minutes": None,
                },
            }
        since = (datetime.now(UTC) - timedelta(days=days)).isoformat()
        org_id = str(tenant.org_id)
        property_id = str(tenant.property_id) if tenant.property_id else None

        def _scoped(query):
            if property_id:
                query = query.eq("property_id", property_id)
            return query

        documents = (await _scoped(
            client.table("documents")
            .select("id,status,review_needed,created_at")
            .eq("organization_id", org_id)
            .gte("created_at", since)
        ).execute()).data or []
        line_items = (await _scoped(
            client.table("document_line_items")
            .select("id,review_needed,corrected_at,inventory_movement_id,created_at")
            .eq("organization_id", org_id)
            .gte("created_at", since)
        ).execute()).data or []
        transitions = (await _scoped(
            client.table("shopping_list_transitions")
            .select("id,shopping_list_id,previous_state,next_state,reason,created_at,metadata")
            .eq("organization_id", org_id)
            .gte("created_at", since)
        ).execute()).data or []
        lists = (await _scoped(
            client.table("shopping_lists")
            .select("id,status,total_estimated_cost,total_actual_cost,updated_at")
            .eq("organization_id", org_id)
            .gte("updated_at", since)
        ).execute()).data or []
        evaluations = (await _scoped(
            client.table("prediction_evaluations")
            .select("id,quantity_error,depletion_date_error_days,recommendation_accepted,operator_overridden,created_at")
            .eq("organization_id", org_id)
            .gte("created_at", since)
        ).execute()).data or []
        price_history = (await _scoped(
            client.table("item_price_history")
            .select("id,vendor_id,item_id,price,purchase_date")
            .eq("organization_id", org_id)
            .gte("purchase_date", since)
            .order("purchase_date")
        ).execute()).data or []
        movements = (await _scoped(
            client.table("inventory_movements")
            .select("id,movement_type,reference_id,reference_type,created_at")
            .eq("organization_id", org_id)
            .gte("created_at", since)
        ).execute()).data or []

        documents_processed = len(documents)
        total_line_items = len(line_items)
        line_items_auto_accepted = sum(1 for row in line_items if not row.get("review_needed"))
        manual_review_count = sum(1 for row in line_items if row.get("review_needed") or row.get("corrected_at"))
        manual_review_rate = (manual_review_count / total_line_items) if total_line_items else None

        generated_recommendations = sum(
            1 for row in transitions
            if str(row.get("next_state") or "") == "recommended"
        )
        completed_reorders = sum(1 for row in lists if str(row.get("status") or "") == "received")
        recommendation_acceptances = sum(1 for row in evaluations if row.get("recommendation_accepted") is True)
        operator_overrides = sum(1 for row in evaluations if row.get("operator_overridden") is True)
        evaluated_predictions = len(evaluations)
        recommendation_acceptance_rate = (
            recommendation_acceptances / evaluated_predictions if evaluated_predictions else None
        )
        forecast_accuracy = None
        if evaluated_predictions:
            quantity_scores = []
            for row in evaluations:
                quantity_error = row.get("quantity_error")
                if quantity_error is None:
                    continue
                try:
                    quantity_scores.append(max(0.0, 1.0 - min(abs(float(quantity_error)), 1.0)))
                except Exception:
                    continue
            if quantity_scores:
                forecast_accuracy = sum(quantity_scores) / len(quantity_scores)

        observed_price_variance = 0.0
        price_change_count = 0
        last_seen: dict[tuple[str, str], float] = {}
        for row in price_history:
            key = (str(row.get("vendor_id") or ""), str(row.get("item_id") or ""))
            try:
                price = float(row.get("price") or 0)
            except Exception:
                continue
            if key in last_seen and last_seen[key] > 0:
                observed_price_variance += abs(price - last_seen[key])
                price_change_count += 1
            last_seen[key] = price

        automated_workflow_actions = sum(
            1 for row in movements
            if str(row.get("movement_type") or "") == "purchase"
            and str(row.get("reference_type") or "") == "document"
        )
        time_saved_minutes = None
        if total_line_items:
            # Explicit modeled methodology: 1.5 minutes saved for each auto-accepted line item.
            time_saved_minutes = round(line_items_auto_accepted * 1.5, 1)

        enough_history = (
            documents_processed > 0
            and total_line_items > 0
            and (evaluated_predictions > 0 or generated_recommendations > 0 or price_change_count > 0)
        )

        headline = (
            "Neumas is establishing your household baseline."
            if workspace_experience == "HOUSEHOLD"
            else "Neumas is establishing your operating baseline."
        )
        mode = "baseline"
        metrics: list[dict[str, Any]] = []
        if enough_history:
            mode = "measured"
            headline = "Impact This Month"
            metrics = [
                {
                    "key": "automated_document_actions",
                    "label": "Automated document actions",
                    "value": automated_workflow_actions,
                    "kind": "actual",
                },
                {
                    "key": "reorder_decisions_supported",
                    "label": "Reorder decisions supported",
                    "value": generated_recommendations,
                    "kind": "actual",
                },
                {
                    "key": "recommendation_acceptance_rate",
                    "label": "Recommendation acceptance",
                    "value": recommendation_acceptance_rate,
                    "kind": "actual",
                    "format": "percent",
                },
                {
                    "key": "observed_price_variance",
                    "label": "Observed price variance identified",
                    "value": observed_price_variance if price_change_count else None,
                    "kind": "actual",
                    "format": "currency",
                },
                {
                    "key": "estimated_admin_time_saved",
                    "label": "Estimated admin time saved",
                    "value": time_saved_minutes,
                    "kind": "estimated",
                    "format": "minutes",
                    "methodology": "1.5 minutes per automatically accepted line item.",
                },
            ]

        return {
            "mode": mode,
            "headline": headline,
            "period_days": days,
            "generated_at": datetime.now(UTC).isoformat(),
            "metrics": metrics,
            "summary": {
                "documents_processed": documents_processed,
                "line_items_processed": total_line_items,
                "line_items_auto_accepted": line_items_auto_accepted,
                "manual_review_rate": manual_review_rate,
                "reorder_recommendations_generated": generated_recommendations,
                "recommendation_acceptance_rate": recommendation_acceptance_rate,
                "operator_overrides": operator_overrides,
                "completed_reorders": completed_reorders,
                "forecast_accuracy": forecast_accuracy,
                "observed_price_variance": observed_price_variance if price_change_count else None,
                "automated_workflow_actions": automated_workflow_actions,
                "estimated_admin_time_saved_minutes": time_saved_minutes,
            },
        }
