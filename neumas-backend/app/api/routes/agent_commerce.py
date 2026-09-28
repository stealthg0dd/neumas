from __future__ import annotations

from collections.abc import Callable
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.responses import Response

from app.api.deps import TenantContext, get_tenant_context
from app.core.security import rate_limiter
from app.schemas.agent_commerce import (
    AgentCommerceEnvelope,
    ApiCredentialCreate,
    ApiCredentialResponse,
    ExternalPrincipal,
    GeneratedApiCredential,
    PaginationMeta,
    ServiceClientCreate,
    ServiceClientResponse,
)
from app.services.agent_commerce_service import (
    AgentCommerceAuthError,
    AgentCommerceService,
)


def _request_id(request: Request) -> str | None:
    value = getattr(request.state, "request_id", None)
    return str(value) if value else request.headers.get("X-Request-ID")


def _correlation_id(request: Request) -> str | None:
    return request.headers.get("X-Correlation-ID") or request.headers.get("X-Request-ID") or _request_id(request)


def _envelope(request: Request, data: Any, *, limit: int | None = None, offset: int | None = None) -> AgentCommerceEnvelope:
    pagination = None
    if limit is not None and offset is not None and isinstance(data, list):
        pagination = PaginationMeta(limit=limit, offset=offset, returned=len(data))
    return AgentCommerceEnvelope(
        data=data,
        pagination=pagination,
        request_id=_request_id(request),
        correlation_id=_correlation_id(request),
    )


def _error(request: Request, status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": _request_id(request),
                "correlation_id": _correlation_id(request),
            }
        },
    )


class AgentCommerceRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Any]:
        original_route_handler = super().get_route_handler()

        async def custom_route_handler(request: Request) -> Response:
            try:
                return await original_route_handler(request)
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {}
                return _error(
                    request,
                    exc.status_code,
                    str(detail.get("code") or "request_failed"),
                    str(detail.get("message") or exc.detail),
                )
            except RequestValidationError:
                return _error(request, status.HTTP_422_UNPROCESSABLE_ENTITY, "validation_error", "Request validation failed")

        return custom_route_handler


router = APIRouter(route_class=AgentCommerceRoute)
service = AgentCommerceService()


def _bounded_limit(limit: int) -> int:
    return max(1, min(limit, 100))


async def get_external_principal(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> ExternalPrincipal:
    allowed, _ = await rate_limiter.check_rate_limit(request, limit=120, window_seconds=60)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail={"code": "rate_limited", "message": "Too many requests"})
    api_key = x_api_key
    if not api_key and authorization and authorization.lower().startswith("bearer "):
        api_key = authorization.split(" ", 1)[1]
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "missing_api_key", "message": "Missing API credential"})
    try:
        return await service.authenticate(api_key)
    except AgentCommerceAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}) from exc


def require_scope(scope: str):
    async def _require(principal: Annotated[ExternalPrincipal, Depends(get_external_principal)]) -> ExternalPrincipal:
        if not principal.has_scope(scope):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "insufficient_scope", "message": f"Requires scope: {scope}"})
        return principal

    return _require


@router.get("/developer/service-clients", response_model=list[ServiceClientResponse])
async def list_service_clients(tenant: Annotated[TenantContext, Depends(get_tenant_context)]) -> list[ServiceClientResponse]:
    return await service.list_service_clients(tenant)


@router.post("/developer/service-clients", response_model=ServiceClientResponse, status_code=status.HTTP_201_CREATED)
async def create_service_client(
    payload: ServiceClientCreate,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ServiceClientResponse:
    try:
        return await service.create_service_client(tenant, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/developer/credentials", response_model=list[ApiCredentialResponse])
async def list_credentials(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    service_client_id: UUID | None = None,
) -> list[ApiCredentialResponse]:
    return await service.list_credentials(tenant, service_client_id)


@router.post("/developer/service-clients/{service_client_id}/credentials", response_model=GeneratedApiCredential, status_code=status.HTTP_201_CREATED)
async def generate_credential(
    service_client_id: UUID,
    payload: ApiCredentialCreate,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> GeneratedApiCredential:
    try:
        return await service.generate_credential(tenant, service_client_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/developer/credentials/{credential_id}/revoke", response_model=ApiCredentialResponse)
async def revoke_credential(
    credential_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ApiCredentialResponse:
    try:
        return await service.revoke_credential(tenant, credential_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/v1/suppliers", response_model=AgentCommerceEnvelope)
async def external_suppliers(
    request: Request,
    principal: Annotated[ExternalPrincipal, Depends(require_scope("supplier:read"))],
    limit: int = 50,
    offset: int = 0,
) -> AgentCommerceEnvelope:
    limit = _bounded_limit(limit)
    data = await service.list_suppliers(principal, limit=limit, offset=max(0, offset))
    return _envelope(request, [item.model_dump(mode="json") for item in data], limit=limit, offset=max(0, offset))


@router.get("/v1/suppliers/{supplier_id}", response_model=AgentCommerceEnvelope)
async def external_supplier(
    supplier_id: UUID,
    request: Request,
    principal: Annotated[ExternalPrincipal, Depends(require_scope("supplier:read"))],
) -> AgentCommerceEnvelope:
    supplier = await service.get_supplier(principal, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "supplier_not_found", "message": "Supplier not found"})
    return _envelope(request, supplier.model_dump(mode="json"))


@router.get("/v1/catalog/search", response_model=AgentCommerceEnvelope)
async def external_catalog_search(
    request: Request,
    principal: Annotated[ExternalPrincipal, Depends(require_scope("catalog:read"))],
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AgentCommerceEnvelope:
    limit = _bounded_limit(limit)
    data = await service.search_catalog(principal, query=q, limit=limit, offset=max(0, offset))
    return _envelope(request, [item.model_dump(mode="json") for item in data], limit=limit, offset=max(0, offset))


@router.get("/v1/offers", response_model=AgentCommerceEnvelope)
async def external_offers(
    request: Request,
    principal: Annotated[ExternalPrincipal, Depends(require_scope("offer:read"))],
    supplier_id: UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AgentCommerceEnvelope:
    limit = _bounded_limit(limit)
    data = await service.list_offers(principal, supplier_id=supplier_id, limit=limit, offset=max(0, offset))
    return _envelope(request, [item.model_dump(mode="json") for item in data], limit=limit, offset=max(0, offset))


@router.get("/v1/availability", response_model=AgentCommerceEnvelope)
async def external_availability(
    request: Request,
    principal: Annotated[ExternalPrincipal, Depends(require_scope("availability:read"))],
    supplier_id: UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AgentCommerceEnvelope:
    limit = _bounded_limit(limit)
    data = await service.list_availability(principal, supplier_id=supplier_id, limit=limit, offset=max(0, offset))
    return _envelope(request, [item.model_dump(mode="json") for item in data], limit=limit, offset=max(0, offset))
