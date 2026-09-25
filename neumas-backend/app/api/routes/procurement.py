from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import TenantContext, require_property
from app.schemas.procurement import ProcurementSummary
from app.services.procurement_optimizer_service import ProcurementOptimizerService

router = APIRouter()
service = ProcurementOptimizerService()


@router.get("/summary", response_model=ProcurementSummary)
async def procurement_summary(tenant: TenantContext = require_property()) -> ProcurementSummary:
    return await service.summary(tenant)
