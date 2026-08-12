"""
Predictions routes.
"""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.api.deps import TenantContext, get_tenant_context, require_property
from app.core.celery_app import celery_app
from app.core.constants import ACTIVE_OPERATIONAL_FORECAST_TYPE
from app.core.logging import get_logger
from app.db.repositories.predictions import get_predictions_repository
from app.services.entitlement_service import EntitlementService
from app.services.forecast_eligibility_service import ForecastEligibilityService
from app.services.prediction_outcome_service import PredictionOutcomeService

logger = get_logger(__name__)
router = APIRouter()
prediction_outcome_service = PredictionOutcomeService()
entitlement_service = EntitlementService()
forecast_eligibility_service = ForecastEligibilityService()

# Urgency ordering for sorting (lower = more urgent)
_URGENCY_ORDER = {"critical": 0, "urgent": 1, "soon": 2, "later": 3}


class ForecastRequest(BaseModel):
    property_id: UUID | None = None
    forecast_days: int = 7


class ForecastQueuedResponse(BaseModel):
    job_id: str
    status: str = "queued"
    message: str = "Forecast job queued"


class ForecastEligibilityResponse(BaseModel):
    status: str
    reason_code: str
    evidence_cycles_available: int
    evidence_cycles_required: int
    last_forecast_at: str | None = None
    next_eligible_at: str | None = None
    detail: str = ""
    forecast_running: bool = False
    cadence_hours: int | None = None
    purchase_cycles_observed: int = 0
    consumption_movements_observed: int = 0
    history_days_observed: int = 0
    canonical_item_coverage: float = 0.0


@router.post(
    "/forecast",
    response_model=ForecastQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger demand forecast",
    description="Enqueue pattern recomputation then stockout prediction for a property.",
)
async def forecast(
    body: ForecastRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ForecastQueuedResponse:
    """
    Enqueues two Celery tasks in order:
    1. agents.recompute_patterns_for_property
    2. agents.recompute_predictions_for_property
    Returns the task ID of the prediction task.
    """
    property_id = str(body.property_id or tenant.property_id)
    eligibility = await forecast_eligibility_service.evaluate_forecast_eligibility(
        tenant.org_id,
        UUID(property_id),
        role=tenant.role,
        user_id=tenant.user_id,
        ignore_freshness=True,
    )
    await entitlement_service.enforce_forecast_frequency(tenant, UUID(property_id))

    try:
        # Step 1 -- recompute consumption patterns
        celery_app.send_task(
            "agents.recompute_patterns_for_property",
            args=[property_id],
            queue="neumas.predictions",
        )

        # Step 2 -- recompute stockout predictions
        pred_task = celery_app.send_task(
            "agents.recompute_predictions_for_property",
            args=[property_id],
            queue="neumas.predictions",
        )
    except Exception as e:
        err_str = str(e).lower()
        is_redis_down = "redis" in err_str or "retry limit" in err_str or "connection" in err_str
        logger.error("Failed to enqueue forecast", property_id=property_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE if is_redis_down else status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Background worker is temporarily unavailable. Please try again in a moment." if is_redis_down else "Failed to queue forecast",
        )

    logger.info(
        "Forecast queued",
        property_id=property_id,
        task_id=pred_task.id,
        user_id=str(tenant.user_id),
        trigger_reason=eligibility.reason_code,
    )
    return ForecastQueuedResponse(job_id=pred_task.id)


@router.get(
    "/eligibility",
    response_model=ForecastEligibilityResponse,
    summary="Get forecast eligibility",
    description="Return the canonical automatic-forecast readiness state for the current property.",
)
async def get_forecast_eligibility(
    tenant: TenantContext = require_property(),
) -> ForecastEligibilityResponse:
    result = await forecast_eligibility_service.evaluate_forecast_eligibility(
        tenant.org_id,
        tenant.property_id,
        role=tenant.role,
        user_id=tenant.user_id,
    )
    return ForecastEligibilityResponse(**result.to_dict())


@router.get(
    "",
    summary="List predictions",
    description="Get stockout predictions for the current property, sorted by urgency.",
)
@router.get(
    "/",
    summary="List predictions",
    description="Get stockout predictions for the current property, sorted by urgency.",
)
async def list_predictions(
    tenant: TenantContext = require_property(),
    urgency: Annotated[str | None, Query(description="Filter by urgency: critical, urgent, soon, later")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[dict]:
    """
    Returns stockout predictions sorted by urgency (critical first) then
    predicted runout date.  Pass ?urgency=critical to restrict to one bucket.
    """
    try:
        repo = await get_predictions_repository(tenant)
        rows = await repo.get_by_property(
            tenant,
            prediction_type=ACTIVE_OPERATIONAL_FORECAST_TYPE,
            limit=limit,
        )
    except Exception as e:
        # Return an empty list rather than a 500 so the frontend degrades
        # gracefully instead of crashing on .filter() of undefined.
        logger.error("Failed to list predictions", error=str(e))
        return []

    now = datetime.now(UTC)
    normalized_rows: list[dict] = []
    for row in rows:
        prediction_date = row.get("prediction_date")
        days_until_runout = None
        if prediction_date:
            try:
                runout_at = datetime.fromisoformat(str(prediction_date).replace("Z", "+00:00"))
                days_until_runout = max(0, (runout_at - now).days)
            except Exception:
                days_until_runout = None

        normalized_rows.append(
            {
                **row,
                "item_name": (row.get("inventory_item") or {}).get("name"),
                "days_until_runout": days_until_runout,
                "time_horizon_days": days_until_runout,
                "recommended_action": (
                    "Review reorder plan"
                    if days_until_runout is not None and days_until_runout <= 14
                    else "Monitor"
                ),
                "prediction_version": row.get("prediction_version") or row.get("model_version"),
                "generated_at": row.get("generated_at") or row.get("created_at"),
                "algorithm_identifier": row.get("algorithm_identifier") or row.get("model_version"),
                "predicted_depletion_date": row.get("predicted_depletion_date") or row.get("prediction_date"),
                "predicted_quantity_needed": row.get("predicted_quantity_needed") or row.get("predicted_value"),
                "evaluation_status": row.get("evaluation_status", "pending"),
            }
        )
    rows = normalized_rows

    # Optional urgency filter (stored in stockout_risk_level column)
    if urgency:
        rows = [r for r in rows if r.get("stockout_risk_level") == urgency]

    # Sort: critical -> urgent -> soon -> later, then by prediction_date asc
    rows.sort(key=lambda r: (
        _URGENCY_ORDER.get(r.get("stockout_risk_level", "later"), 99),
        r.get("prediction_date", ""),
    ))

    return rows


@router.get(
    "/summary",
    summary="Prediction outcome summary",
    description="Aggregate recent prediction outcomes and confidence calibration for the current tenant.",
)
async def get_prediction_summary(
    tenant: TenantContext = require_property(),
    property_id: Annotated[UUID | None, Query(description="Optional property override for org-wide admins")] = None,
) -> dict:
    try:
        return await prediction_outcome_service.summarize(tenant, property_id=property_id)
    except Exception as e:
        logger.error("Failed to summarize prediction outcomes", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to summarize prediction outcomes",
        )
