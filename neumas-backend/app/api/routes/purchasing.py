from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.api.deps import TenantContext, require_property
from app.schemas.purchasing import (
    GoodsReceiptCreate,
    PurchaseOrder,
    PurchaseOrderCreate,
    SupplierAcknowledgementCreate,
    SupplierInvoiceCreate,
)
from app.services.purchasing_service import PurchasingService

router = APIRouter()
service = PurchasingService()


@router.get("/summary")
async def purchasing_summary(tenant: TenantContext = require_property()) -> dict:
    return await service.summary(tenant)


@router.post("/purchase-orders", response_model=PurchaseOrder)
async def create_purchase_order(payload: PurchaseOrderCreate, tenant: TenantContext = require_property()) -> PurchaseOrder:
    return await service.create_purchase_order(tenant, payload)


@router.post("/purchase-orders/{po_id}/transition")
async def transition_purchase_order(po_id: UUID, next_state: str, tenant: TenantContext = require_property()) -> dict:
    await service.transition_po(tenant, po_id, next_state)
    return {"status": "ok"}


@router.post("/acknowledgements")
async def acknowledge(payload: SupplierAcknowledgementCreate, tenant: TenantContext = require_property()) -> dict:
    return await service.acknowledge(tenant, payload)


@router.post("/goods-receipts")
async def receive_goods(payload: GoodsReceiptCreate, tenant: TenantContext = require_property()) -> dict:
    return await service.receive_goods(tenant, payload)


@router.post("/invoices")
async def create_invoice(payload: SupplierInvoiceCreate, tenant: TenantContext = require_property()) -> dict:
    return await service.create_invoice(tenant, payload)
