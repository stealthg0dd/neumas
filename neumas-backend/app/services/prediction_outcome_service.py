from __future__ import annotations

from datetime import UTC, datetime
from math import floor
from typing import Any
from uuid import UUID, uuid4

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class PredictionOutcomeService:
    """Persists prediction outcomes and computes tenant-scoped summary metrics."""

    async def record_evaluation(
        self,
        tenant: TenantContext,
        prediction: dict[str, Any],
        *,
        actual_quantity: float | None,
        actual_depletion_date: datetime | None,
        stockout_occurred: bool | None,
        recommendation_accepted: bool | None,
        operator_overridden: bool | None,
        reorder_completed: bool | None,
        source_window_end: datetime | None,
        idempotency_key: str,
        notes: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        if client is None:
            logger.info("Prediction outcome persistence skipped because admin client is unavailable")
            return {
                "prediction_id": str(prediction["id"]),
                "idempotency_key": idempotency_key,
                "skipped": True,
            }
        prediction_id = str(prediction["id"])

        existing = await (
            client.table("prediction_evaluations")
            .select("*")
            .eq("prediction_id", prediction_id)
            .eq("idempotency_key", idempotency_key)
            .limit(1)
            .execute()
        )
        rows = existing.data or []
        if rows:
            return rows[0]

        predicted_qty = float(prediction.get("predicted_quantity_needed") or prediction.get("predicted_value") or 0)
        confidence = float(prediction.get("confidence") or 0)
        qty_error = (actual_quantity - predicted_qty) if actual_quantity is not None else None

        predicted_depletion_raw = prediction.get("predicted_depletion_date") or prediction.get("prediction_date")
        predicted_depletion_date = None
        if predicted_depletion_raw:
            predicted_depletion_date = datetime.fromisoformat(str(predicted_depletion_raw).replace("Z", "+00:00"))

        depletion_date_error_days = None
        if predicted_depletion_date and actual_depletion_date:
            depletion_date_error_days = floor((actual_depletion_date - predicted_depletion_date).total_seconds() / 86400)

        calibration_error = None
        if stockout_occurred is not None:
            actual_probability = 1.0 if stockout_occurred else 0.0
            calibration_error = abs(confidence - actual_probability)

        confidence_bucket = "low"
        if confidence >= 0.85:
            confidence_bucket = "high"
        elif confidence >= 0.6:
            confidence_bucket = "medium"

        payload = {
            "id": str(uuid4()),
            "prediction_id": prediction_id,
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else prediction.get("property_id"),
            "item_id": prediction.get("item_id"),
            "actual_depletion_date": actual_depletion_date.isoformat() if actual_depletion_date else None,
            "actual_quantity": actual_quantity,
            "quantity_error": qty_error,
            "depletion_date_error_days": depletion_date_error_days,
            "stockout_occurred": stockout_occurred,
            "recommendation_accepted": recommendation_accepted,
            "operator_overridden": operator_overridden,
            "reorder_completed": reorder_completed,
            "confidence": confidence,
            "confidence_bucket": confidence_bucket,
            "calibration_error": calibration_error,
            "notes": notes,
            "source_window_end": source_window_end.isoformat() if source_window_end else None,
            "idempotency_key": idempotency_key,
            "metadata": metadata or {},
        }
        insert_resp = await client.table("prediction_evaluations").insert(payload).execute()

        await (
            client.table("predictions")
            .update(
                {
                    "evaluated_at": datetime.now(UTC).isoformat(),
                    "evaluation_status": "evaluated",
                }
            )
            .eq("id", prediction_id)
            .execute()
        )
        return insert_resp.data[0]

    async def summarize(
        self,
        tenant: TenantContext,
        *,
        property_id: UUID | None = None,
        limit: int = 8,
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        if client is None:
            return {
                "sample_size": 0,
                "insufficient_history": True,
                "forecast_accuracy": None,
                "confidence_calibration": None,
                "acceptance_rate": None,
                "override_rate": None,
                "reorder_completion_rate": None,
                "drift_score": None,
                "recent_outcomes": [],
            }
        target_property = str(property_id or tenant.property_id) if (property_id or tenant.property_id) else None

        predictions_query = (
            client.table("predictions")
            .select("id, property_id, item_id, confidence, prediction_date, predicted_value, predicted_quantity_needed, predicted_depletion_date, inventory_item:inventory_items(id, name)")
            .eq("organization_id", str(tenant.org_id))
            .order("generated_at", desc=True)
            .limit(200)
        )
        if target_property:
            predictions_query = predictions_query.eq("property_id", target_property)
        predictions_resp = await predictions_query.execute()
        predictions = predictions_resp.data or []

        eval_query = (
            client.table("prediction_evaluations")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .order("evaluated_at", desc=True)
            .limit(200)
        )
        if target_property:
            eval_query = eval_query.eq("property_id", target_property)
        eval_resp = await eval_query.execute()
        evaluations = eval_resp.data or []

        sample_size = len(evaluations)
        if sample_size == 0:
            return {
                "sample_size": 0,
                "insufficient_history": True,
                "forecast_accuracy": None,
                "confidence_calibration": None,
                "acceptance_rate": None,
                "override_rate": None,
                "reorder_completion_rate": None,
                "drift_score": None,
                "recent_outcomes": [],
            }

        avg_abs_qty_error = sum(abs(float(row.get("quantity_error") or 0)) for row in evaluations) / sample_size
        avg_abs_days_error = sum(abs(float(row.get("depletion_date_error_days") or 0)) for row in evaluations) / sample_size
        avg_calibration_error = sum(float(row.get("calibration_error") or 0) for row in evaluations) / sample_size
        accepted = [row for row in evaluations if row.get("recommendation_accepted") is not None]
        overrides = [row for row in evaluations if row.get("operator_overridden") is not None]
        completed = [row for row in evaluations if row.get("reorder_completed") is not None]
        stockout_rows = [row for row in evaluations if row.get("stockout_occurred") is not None]

        stockout_precision = None
        if stockout_rows:
            true_positive = sum(1 for row in stockout_rows if row.get("stockout_occurred"))
            stockout_precision = true_positive / len(stockout_rows)

        prediction_lookup = {str(row["id"]): row for row in predictions if row.get("id")}
        recent_outcomes = []
        for row in evaluations[:limit]:
            prediction = prediction_lookup.get(str(row.get("prediction_id")), {})
            recent_outcomes.append(
                {
                    "prediction_id": row.get("prediction_id"),
                    "item_id": row.get("item_id"),
                    "item_name": (prediction.get("inventory_item") or {}).get("name"),
                    "evaluated_at": row.get("evaluated_at"),
                    "quantity_error": row.get("quantity_error"),
                    "depletion_date_error_days": row.get("depletion_date_error_days"),
                    "recommendation_accepted": row.get("recommendation_accepted"),
                    "operator_overridden": row.get("operator_overridden"),
                    "stockout_occurred": row.get("stockout_occurred"),
                    "confidence": row.get("confidence"),
                }
            )

        return {
            "sample_size": sample_size,
            "insufficient_history": sample_size < 3,
            "forecast_accuracy": max(0.0, 1 - min(1.0, avg_abs_qty_error / 10)),
            "mean_quantity_error": avg_abs_qty_error,
            "mean_depletion_date_error_days": avg_abs_days_error,
            "stockout_precision": stockout_precision,
            "confidence_calibration": max(0.0, 1 - min(1.0, avg_calibration_error)),
            "acceptance_rate": (sum(1 for row in accepted if row.get("recommendation_accepted")) / len(accepted)) if accepted else None,
            "override_rate": (sum(1 for row in overrides if row.get("operator_overridden")) / len(overrides)) if overrides else None,
            "reorder_completion_rate": (sum(1 for row in completed if row.get("reorder_completed")) / len(completed)) if completed else None,
            "drift_score": min(1.0, (avg_abs_qty_error / 10) + (avg_abs_days_error / 14)),
            "recent_outcomes": recent_outcomes,
        }
