from __future__ import annotations

import json

from fastapi import APIRouter, Header, Request

from app.api.deps import TenantContext, require_property
from app.schemas.integrations import (
    IntegrationConnectionResponse,
    ProviderWebhookIngestResponse,
)
from app.services.integrations.integration_service import IntegrationService

router = APIRouter()
service = IntegrationService()


@router.get("/connections", response_model=list[IntegrationConnectionResponse])
async def list_connections(tenant: TenantContext = require_property()) -> list[IntegrationConnectionResponse]:
    return await service.list_connections(tenant)


@router.get("/status")
async def connection_status(tenant: TenantContext = require_property()) -> dict:
    return await service.connection_status(tenant)


@router.post("/webhooks/square", response_model=ProviderWebhookIngestResponse)
async def square_webhook(
    request: Request,
    x_square_hmacsha256_signature: str | None = Header(default=None),
    tenant: TenantContext = require_property(),
) -> ProviderWebhookIngestResponse:
    body = await request.body()
    payload = json.loads(body.decode() or "{}")
    return await service.ingest_square_webhook(
        tenant,
        body=body,
        payload=payload,
        signature_header=x_square_hmacsha256_signature,
        notification_url=str(request.url),
    )
