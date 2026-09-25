from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.deps import TenantContext, require_property
from app.schemas.autonomy import (
    ActionRecord,
    ActionRequest,
    AgentCenterSummary,
    DecisionInput,
    DecisionRecord,
)
from app.services.autonomy_service import AutonomyService

router = APIRouter()
service = AutonomyService()


@router.get("/agents/summary", response_model=AgentCenterSummary)
async def agent_summary(tenant: TenantContext = require_property()) -> AgentCenterSummary:
    return await service.agent_summary(tenant)


@router.get("/decisions", response_model=list[DecisionRecord])
async def list_decisions(tenant: TenantContext = require_property()) -> list[DecisionRecord]:
    return await service.list_decisions(tenant)


@router.post("/decisions", response_model=DecisionRecord)
async def create_decision(payload: DecisionInput, tenant: TenantContext = require_property()) -> DecisionRecord:
    return await service.create_decision(tenant, payload)


@router.post("/actions", response_model=ActionRecord)
async def execute_action(payload: ActionRequest, tenant: TenantContext = require_property()) -> ActionRecord:
    return await service.execute_action(tenant, payload)


@router.post("/actions/{action_id}/retry", response_model=ActionRecord)
async def retry_action(action_id: UUID, tenant: TenantContext = require_property()) -> ActionRecord:
    try:
        return await service.retry_action(tenant, action_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
