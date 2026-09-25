from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import TenantContext, require_property
from app.schemas.demand import (
    DemandDashboardResponse,
    ForecastGenerateRequest,
    ForecastRunResponse,
    UniversalImportRequest,
    UniversalImportResponse,
)
from app.services.demand_service import DemandService

router = APIRouter()
service = DemandService()


@router.post("/imports", response_model=UniversalImportResponse)
async def import_canonical_data(payload: UniversalImportRequest, tenant: TenantContext = require_property()) -> UniversalImportResponse:
    return await service.import_csv(
        tenant,
        payload.import_type,
        payload.csv_text,
        commit=payload.commit,
        mapping=payload.mapping,
        idempotency_key=payload.idempotency_key,
        source_filename=payload.source_filename,
    )


@router.post("/forecasts", response_model=ForecastRunResponse)
async def generate_forecast(payload: ForecastGenerateRequest, tenant: TenantContext = require_property()) -> ForecastRunResponse:
    return await service.generate_forecast(tenant, payload)


@router.get("/summary", response_model=DemandDashboardResponse)
async def demand_summary(tenant: TenantContext = require_property()) -> DemandDashboardResponse:
    return await service.dashboard(tenant)
