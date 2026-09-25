from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import TenantContext, require_property
from app.core.logging import get_logger
from app.schemas.control_center import ControlCenterSummary
from app.services.control_center_service import ControlCenterService

logger = get_logger(__name__)
router = APIRouter()

control_center_service = ControlCenterService()


@router.get(
    "/summary",
    response_model=ControlCenterSummary,
    summary="Get Control Center summary",
    description="Aggregate the operator Control Center from existing tenant-scoped operational data.",
)
async def get_control_center_summary(
    tenant: TenantContext = require_property(),
) -> ControlCenterSummary:
    try:
        return await control_center_service.build_summary(tenant)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Failed to build control center summary", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to build control center summary",
        )
