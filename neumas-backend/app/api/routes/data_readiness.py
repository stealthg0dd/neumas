from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import TenantContext, get_tenant_context
from app.core.logging import get_logger
from app.schemas.data_readiness import DataReadinessResponse
from app.services.data_readiness_service import DataReadinessService

logger = get_logger(__name__)
router = APIRouter()
data_readiness_service = DataReadinessService()


@router.get(
    "",
    response_model=DataReadinessResponse,
    summary="Get tenant data readiness",
    description="Assess whether real tenant data is present for demand, procurement, margin, and reports.",
)
async def get_data_readiness(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> DataReadinessResponse:
    try:
        return await data_readiness_service.build(tenant)
    except Exception as exc:
        logger.exception("Failed to build data readiness", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to build data readiness",
        )
