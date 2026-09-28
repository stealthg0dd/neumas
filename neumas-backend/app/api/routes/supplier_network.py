"""Supplier portal API — org-scoped, vendor-backed."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import TenantContext, get_tenant_context
from app.schemas.supplier_network import (
    SupplierAccount,
    SupplierAccountCreate,
    SupplierAccountUpdate,
    SupplierAvailability,
    SupplierAvailabilityUpsert,
    SupplierCapability,
    SupplierCapabilityUpsert,
    SupplierCatalogImportRequest,
    SupplierCatalogImportResult,
    SupplierCommercialTerms,
    SupplierCommercialTermsUpsert,
    SupplierDeliverySlot,
    SupplierDeliverySlotCreate,
    SupplierLocation,
    SupplierLocationCreate,
    SupplierServiceArea,
    SupplierServiceAreaCreate,
    SupplierWebhookIngest,
    SupplierWorkspaceSummary,
)
from app.services.supplier_network_service import (
    SupplierNetworkError,
    SupplierNetworkService,
)

router = APIRouter()
service = SupplierNetworkService()
TenantDep = Annotated[TenantContext, Depends(get_tenant_context)]


def _map_error(exc: SupplierNetworkError) -> HTTPException:
    code = status.HTTP_400_BAD_REQUEST
    if exc.code == "not_found":
        code = status.HTTP_404_NOT_FOUND
    elif exc.code == "forbidden":
        code = status.HTTP_403_FORBIDDEN
    elif exc.code == "supabase_unavailable":
        code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HTTPException(status_code=code, detail={"code": exc.code, "message": str(exc)})


@router.get("/summary", response_model=SupplierWorkspaceSummary)
async def supplier_summary(tenant: TenantDep) -> SupplierWorkspaceSummary:
    try:
        return await service.workspace_summary(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/accounts", response_model=SupplierAccount, status_code=201)
async def create_supplier_account(
    payload: SupplierAccountCreate,
    tenant: TenantDep,
) -> SupplierAccount:
    try:
        return await service.create_account(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.patch("/accounts/me", response_model=SupplierAccount)
async def update_supplier_account(
    payload: SupplierAccountUpdate,
    tenant: TenantDep,
) -> SupplierAccount:
    try:
        return await service.update_account(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/accounts/me/activate-agent", response_model=SupplierAccount)
async def activate_agent_endpoint(tenant: TenantDep) -> SupplierAccount:
    try:
        return await service.activate_agent_endpoint(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.get("/locations", response_model=list[SupplierLocation])
async def list_locations(tenant: TenantDep) -> list[SupplierLocation]:
    try:
        return await service.list_locations(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/locations", response_model=SupplierLocation, status_code=201)
async def create_location(
    payload: SupplierLocationCreate,
    tenant: TenantDep,
) -> SupplierLocation:
    try:
        return await service.add_location(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.get("/service-areas", response_model=list[SupplierServiceArea])
async def list_service_areas(tenant: TenantDep) -> list[SupplierServiceArea]:
    try:
        return await service.list_service_areas(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/service-areas", response_model=SupplierServiceArea, status_code=201)
async def create_service_area(
    payload: SupplierServiceAreaCreate,
    tenant: TenantDep,
) -> SupplierServiceArea:
    try:
        return await service.add_service_area(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.get("/delivery-slots", response_model=list[SupplierDeliverySlot])
async def list_delivery_slots(tenant: TenantDep) -> list[SupplierDeliverySlot]:
    try:
        return await service.list_delivery_slots(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/delivery-slots", response_model=SupplierDeliverySlot, status_code=201)
async def create_delivery_slot(
    payload: SupplierDeliverySlotCreate,
    tenant: TenantDep,
) -> SupplierDeliverySlot:
    try:
        return await service.add_delivery_slot(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.get("/availability", response_model=list[SupplierAvailability])
async def list_availability(tenant: TenantDep) -> list[SupplierAvailability]:
    try:
        return await service.list_availability(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/availability", response_model=SupplierAvailability, status_code=201)
async def upsert_availability(
    payload: SupplierAvailabilityUpsert,
    tenant: TenantDep,
) -> SupplierAvailability:
    try:
        return await service.upsert_availability(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.get("/commercial-terms", response_model=SupplierCommercialTerms | None)
async def get_commercial_terms(tenant: TenantDep) -> SupplierCommercialTerms | None:
    try:
        return await service.get_commercial_terms(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/commercial-terms", response_model=SupplierCommercialTerms, status_code=201)
async def upsert_commercial_terms(
    payload: SupplierCommercialTermsUpsert,
    tenant: TenantDep,
) -> SupplierCommercialTerms:
    try:
        return await service.upsert_commercial_terms(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.get("/capabilities", response_model=list[SupplierCapability])
async def list_capabilities(tenant: TenantDep) -> list[SupplierCapability]:
    try:
        return await service.list_capabilities(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/capabilities", response_model=SupplierCapability, status_code=201)
async def upsert_capability(
    payload: SupplierCapabilityUpsert,
    tenant: TenantDep,
) -> SupplierCapability:
    try:
        return await service.upsert_capability(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/catalog/import", response_model=SupplierCatalogImportResult)
async def import_catalog(
    payload: SupplierCatalogImportRequest,
    tenant: TenantDep,
) -> SupplierCatalogImportResult:
    try:
        return await service.import_catalog(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.post("/webhooks/ingest")
async def ingest_webhook(payload: SupplierWebhookIngest, tenant: TenantDep) -> dict[str, Any]:
    try:
        return await service.ingest_webhook(tenant, payload)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.get("/rfqs")
async def list_rfqs(tenant: TenantDep) -> list[dict[str, Any]]:
    try:
        return await service.list_supplier_rfqs(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc


@router.get("/offers")
async def list_offers(tenant: TenantDep) -> list[dict[str, Any]]:
    try:
        return await service.list_supplier_offers(tenant)
    except SupplierNetworkError as exc:
        raise _map_error(exc) from exc
