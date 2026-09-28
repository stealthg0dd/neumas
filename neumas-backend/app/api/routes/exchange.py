from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.deps import TenantContext, require_property
from app.schemas.agent_commerce import ExternalPrincipal
from app.schemas.exchange import ExchangeSummary, RfqRecord
from app.services.exchange_service import ExchangeService

router = APIRouter()
service = ExchangeService()


def _principal(tenant: TenantContext) -> ExternalPrincipal:
    return ExternalPrincipal(
        organization_id=tenant.org_id,
        service_client_id=tenant.user_id,
        credential_id=tenant.user_id,
        credential_prefix="human",
        scopes=["rfq:read", "offer:read"],
        allowed_property_ids=[tenant.property_id] if tenant.property_id else [],
    )


@router.get("/summary", response_model=ExchangeSummary)
async def exchange_summary(tenant: TenantContext = require_property()) -> ExchangeSummary:
    return await service.summary(_principal(tenant))


@router.get("/rfqs", response_model=list[RfqRecord])
async def list_rfqs(tenant: TenantContext = require_property()) -> list[RfqRecord]:
    return await service.list_rfqs(_principal(tenant))


@router.get("/rfqs/{rfq_id}", response_model=RfqRecord)
async def get_rfq(rfq_id: UUID, tenant: TenantContext = require_property()) -> RfqRecord:
    record = await service.get_rfq(_principal(tenant), rfq_id)
    if record is None:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return record
