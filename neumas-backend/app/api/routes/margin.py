from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import TenantContext, require_property
from app.schemas.margin import MarginDashboardSummary, WasteEventCreate
from app.services.margin_service import MarginService

router = APIRouter()
service = MarginService()


@router.get("/summary", response_model=MarginDashboardSummary)
async def margin_summary(tenant: TenantContext = require_property()) -> MarginDashboardSummary:
    return await service.dashboard(tenant)


@router.post("/waste-events")
async def create_waste_event(payload: WasteEventCreate, tenant: TenantContext = require_property()) -> dict:
    return await service.create_waste_event(tenant, payload)
