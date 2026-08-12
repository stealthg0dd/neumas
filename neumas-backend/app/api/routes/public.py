from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.core.logging import get_logger
from app.core.security import RateLimitExceeded, rate_limiter
from app.schemas.pilot_leads import PilotLeadCreateRequest, PilotLeadResponse
from app.services.pilot_lead_service import PilotLeadService

logger = get_logger(__name__)
router = APIRouter()
pilot_lead_service = PilotLeadService()


@router.post(
    "/pilot-intake",
    response_model=PilotLeadResponse,
    summary="Submit pilot lead",
)
async def create_pilot_intake(
    request: Request,
    body: PilotLeadCreateRequest,
) -> PilotLeadResponse:
    try:
        allowed, rate_info = await rate_limiter.check_rate_limit(
            request,
            limit=5,
            window_seconds=60 * 60,
        )
        if not allowed:
            raise RateLimitExceeded(retry_after=max(1, rate_info["reset"] - int(__import__("time").time())))
        return await pilot_lead_service.submit(body)
    except Exception as exc:
        if isinstance(exc, RateLimitExceeded):
            raise
        logger.error("Pilot intake persistence failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist pilot request.",
        ) from exc
