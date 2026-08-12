"""
Evaluation tasks — write actual consumption values back to predictions.

This closes the accuracy loop:
  1. When real consumption is observed (inventory movement), find the nearest
     eligible operational prediction for that item and record actual_value.
  2. A periodic sweep re-evaluates past predictions that still lack actual_value
     using aggregate movements after the prediction date.

Queue: evaluation
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

from celery import shared_task
from celery.utils.log import get_task_logger

from app.core.constants import EVALUATION_TARGET_PREDICTION_TYPES, PredictionType

logger = get_task_logger(__name__)


def _evaluation_prediction_types() -> tuple[str, ...]:
    """Return the explicit prediction types eligible for outcome evaluation."""
    return tuple(
        sorted(str(prediction_type) for prediction_type in EVALUATION_TARGET_PREDICTION_TYPES)
    )


def _prediction_select_columns() -> str:
    """Shared column set needed by evaluation persistence and tests."""
    return (
        "id, property_id, item_id, inventory_item_id, prediction_type, "
        "prediction_date, predicted_value, predicted_quantity_needed, confidence, "
        "predicted_depletion_date, actual_value, evaluated_at"
    )


def _rows(data: Any) -> list[dict[str, Any]]:
    """Normalize loosely typed Supabase payloads into dict rows."""
    if not data:
        return []
    return [cast(dict[str, Any], row) for row in data if isinstance(row, dict)]


# ---------------------------------------------------------------------------
# Task: write actual value for a single prediction
# ---------------------------------------------------------------------------


@shared_task(
    name="evaluation.record_actual_value",
    queue="evaluation",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def record_actual_value(
    self,
    org_id: str,
    property_id: str,
    user_id: str,
    item_id: str,
    actual_qty: float,
    observed_at: str,
) -> dict[str, Any]:
    """
    Record the actual consumption value for the nearest pending prediction.

    Called after every inventory movement to keep forecast accuracy up to date.
    """
    try:
        return asyncio.get_event_loop().run_until_complete(
            _record_actual_value_async(
                org_id=org_id,
                property_id=property_id,
                user_id=user_id,
                item_id=item_id,
                actual_qty=actual_qty,
                observed_at=observed_at,
            )
        )
    except Exception as exc:
        logger.warning("record_actual_value failed, retrying: %s", exc)
        raise self.retry(exc=exc)


async def _record_actual_value_async(
    org_id: str,
    property_id: str,
    user_id: str,
    item_id: str,
    actual_qty: float,
    observed_at: str,
) -> dict[str, Any]:
    from app.api.deps import TenantContext
    from app.db.repositories.predictions import get_predictions_repository
    from app.db.supabase_client import get_async_supabase_admin
    from app.services.prediction_outcome_service import PredictionOutcomeService

    tenant = TenantContext(
        user_id=UUID(user_id),
        org_id=UUID(org_id),
        property_id=UUID(property_id),
        role="staff",
        jwt="",
    )
    repo = await get_predictions_repository()
    client = await get_async_supabase_admin()
    if client is None:
        return {"status": "no_prediction_found", "item_id": item_id}

    observed_dt = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))

    # Find the nearest eligible operational prediction for this item
    # within ±3 days of the observation date.
    window_start = (observed_dt - timedelta(days=3)).isoformat()
    window_end = (observed_dt + timedelta(days=3)).isoformat()

    resp = await (
        client.table("predictions")
        .select(_prediction_select_columns())
        .eq("property_id", property_id)
        .eq("inventory_item_id", item_id)
        .in_("prediction_type", list(_evaluation_prediction_types()))
        .is_("actual_value", "null")
        .gte("prediction_date", window_start)
        .lte("prediction_date", window_end)
        .order("prediction_date")
        .limit(1)
        .execute()
    )

    rows = _rows(resp.data)
    if not rows:
        logger.info(
            "No pending prediction found for item %s near %s", item_id, observed_at
        )
        return {"status": "no_prediction_found", "item_id": item_id}

    prediction = cast(dict[str, Any], rows[0])
    prediction_id = UUID(prediction["id"])

    await repo.record_actual(tenant, prediction_id, actual_qty)
    await PredictionOutcomeService().record_evaluation(
        tenant,
        prediction,
        actual_quantity=actual_qty,
        actual_depletion_date=observed_dt,
        stockout_occurred=actual_qty > 0,
        recommendation_accepted=None,
        operator_overridden=None,
        reorder_completed=None,
        source_window_end=observed_dt,
        idempotency_key=f"actual:{prediction_id}:{observed_dt.isoformat()}",
        metadata={
            "trigger": "inventory_movement",
            "prediction_type": prediction.get("prediction_type"),
        },
    )
    logger.info(
        "Recorded actual_value %.3f for prediction %s", actual_qty, prediction_id
    )

    return {
        "status": "recorded",
        "prediction_id": str(prediction_id),
        "actual_value": actual_qty,
        "predicted_value": prediction.get("predicted_value"),
        "prediction_type": prediction.get("prediction_type"),
    }


# ---------------------------------------------------------------------------
# Task: periodic sweep — backfill actual_value for stale predictions
# ---------------------------------------------------------------------------


@shared_task(
    name="evaluation.backfill_actual_values",
    queue="evaluation",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def backfill_actual_values(self, org_id: str, property_id: str) -> dict[str, Any]:
    """
    Sweep predictions older than 1 day that still lack actual_value and
    attempt to compute it from aggregate inventory movements in that window.

    Scheduled daily by Celery Beat per property.
    """
    try:
        return asyncio.get_event_loop().run_until_complete(
            _backfill_async(org_id=org_id, property_id=property_id)
        )
    except Exception as exc:
        logger.warning("backfill_actual_values failed, retrying: %s", exc)
        raise self.retry(exc=exc)


@shared_task(
    name="evaluation.backfill_prediction_evaluations",
    queue="evaluation",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def backfill_prediction_evaluations(
    self,
    org_id: str,
    property_id: str,
    *,
    prediction_type: str = PredictionType.STOCKOUT,
    older_than_days: int = 1,
    limit: int = 500,
) -> dict[str, Any]:
    """Retry-safe one-off backfill for previously skipped prediction evaluations."""
    try:
        return asyncio.get_event_loop().run_until_complete(
            _backfill_prediction_evaluations_entrypoint(
                org_id=org_id,
                property_id=property_id,
                prediction_type=prediction_type,
                older_than_days=older_than_days,
                limit=limit,
            )
        )
    except Exception as exc:
        logger.warning("backfill_prediction_evaluations failed, retrying: %s", exc)
        raise self.retry(exc=exc)


async def _backfill_async(org_id: str, property_id: str) -> dict[str, Any]:
    return await _backfill_prediction_evaluations_entrypoint(
        org_id=org_id,
        property_id=property_id,
        prediction_type=PredictionType.STOCKOUT,
        older_than_days=1,
        limit=100,
        trigger="daily_backfill",
    )


async def _backfill_prediction_evaluations_entrypoint(
    *,
    org_id: str,
    property_id: str,
    prediction_type: str,
    older_than_days: int,
    limit: int,
    trigger: str = "manual_backfill",
) -> dict[str, Any]:
    from app.api.deps import TenantContext

    tenant = TenantContext(
        user_id=UUID(org_id),  # service actor
        org_id=UUID(org_id),
        property_id=UUID(property_id),
        role="service",
        jwt="",
    )

    cutoff = (datetime.now(UTC) - timedelta(days=older_than_days)).isoformat()
    result = await _backfill_prediction_evaluations_async(
        tenant=tenant,
        prediction_types=(prediction_type,),
        prediction_cutoff=cutoff,
        limit=limit,
        trigger=trigger,
    )
    return {
        "status": "ok",
        "property_id": property_id,
        "prediction_type": prediction_type,
        "older_than_days": older_than_days,
        **result,
    }


async def _backfill_prediction_evaluations_async(
    *,
    tenant: Any,
    prediction_types: tuple[str, ...],
    prediction_cutoff: str,
    limit: int,
    trigger: str,
) -> dict[str, int]:
    from app.db.repositories.predictions import get_predictions_repository
    from app.db.supabase_client import get_async_supabase_admin
    from app.services.prediction_outcome_service import PredictionOutcomeService

    client = await get_async_supabase_admin()
    repo = await get_predictions_repository()
    if client is None:
        return {"eligible": 0, "evaluated": 0, "skipped": 0, "failed": 0}

    resp = await (
        client.table("predictions")
        .select(_prediction_select_columns())
        .eq("property_id", str(tenant.property_id))
        .in_("prediction_type", list(prediction_types))
        .is_("actual_value", "null")
        .is_("evaluated_at", "null")
        .lte("prediction_date", prediction_cutoff)
        .limit(limit)
        .execute()
    )
    predictions = _rows(resp.data)

    eligible = len(predictions)
    evaluated = 0
    skipped = 0
    failed = 0

    for pred in predictions:
        item_id = pred.get("inventory_item_id") or pred.get("item_id")
        pred_date = pred.get("prediction_date")
        prediction_id = pred.get("id")
        if not item_id or not pred_date or not prediction_id:
            skipped += 1
            continue

        pred_dt = datetime.fromisoformat(str(pred_date).replace("Z", "+00:00"))
        window_start_dt = pred_dt - timedelta(hours=12)
        window_end_dt = pred_dt + timedelta(hours=36)

        eval_resp = await (
            client.table("prediction_evaluations")
            .select("id")
            .eq("prediction_id", prediction_id)
            .limit(1)
            .execute()
        )
        if _rows(eval_resp.data):
            skipped += 1
            continue

        mv_resp = await (
            client.table("inventory_movements")
            .select("quantity_delta, movement_type, created_at")
            .eq("property_id", str(tenant.property_id))
            .eq("item_id", item_id)
            .in_("movement_type", ["usage", "waste", "expiry"])
            .gte("created_at", window_start_dt.isoformat())
            .lte("created_at", window_end_dt.isoformat())
            .execute()
        )
        movements = _rows(mv_resp.data)
        if not movements:
            skipped += 1
            continue

        actual = sum(abs(float(m.get("quantity_delta", 0))) for m in movements)
        if actual <= 0:
            skipped += 1
            continue

        movement_times = [
            datetime.fromisoformat(str(m["created_at"]).replace("Z", "+00:00"))
            for m in movements
            if m.get("created_at")
        ]
        if not movement_times:
            skipped += 1
            continue

        last_observed_at = max(movement_times)
        if last_observed_at < pred_dt:
            skipped += 1
            continue

        try:
            await repo.record_actual(tenant, UUID(prediction_id), actual)
            await PredictionOutcomeService().record_evaluation(
                tenant,
                pred,
                actual_quantity=actual,
                actual_depletion_date=last_observed_at,
                stockout_occurred=actual > 0,
                recommendation_accepted=None,
                operator_overridden=None,
                reorder_completed=None,
                source_window_end=window_end_dt,
                idempotency_key=f"{trigger}:{prediction_id}",
                metadata={
                    "trigger": trigger,
                    "prediction_type": pred.get("prediction_type"),
                },
            )
            evaluated += 1
        except Exception:
            failed += 1

    logger.info(
        "Prediction evaluation backfill completed for property %s types=%s eligible=%s evaluated=%s skipped=%s failed=%s",
        str(tenant.property_id),
        list(prediction_types),
        eligible,
        evaluated,
        skipped,
        failed,
    )
    return {
        "eligible": eligible,
        "evaluated": evaluated,
        "skipped": skipped,
        "failed": failed,
    }
