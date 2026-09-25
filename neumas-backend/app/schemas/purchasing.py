from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

POState = Literal[
    "DRAFT", "PENDING_APPROVAL", "APPROVED", "DISPATCH_QUEUED", "SENT",
    "ACKNOWLEDGED", "PARTIALLY_CONFIRMED", "CONFIRMED",
    "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED", "FAILED",
]


class PurchaseOrderItemInput(BaseModel):
    name: str
    quantity: Decimal
    uom: str = "unit"
    unit_price: Decimal = Decimal("0")
    inventory_item_id: UUID | None = None
    canonical_ingredient_id: UUID | None = None
    supplier_item_offer_id: UUID | None = None
    commercial_snapshot: dict[str, Any] = Field(default_factory=dict)


class PurchaseOrderCreate(BaseModel):
    vendor_id: UUID
    currency: str = "USD"
    expected_delivery_date: date | None = None
    decision_id: UUID | None = None
    approval_id: UUID | None = None
    external_reference: str | None = None
    pricing_snapshot: dict[str, Any] = Field(default_factory=dict)
    commercial_snapshot: dict[str, Any] = Field(default_factory=dict)
    items: list[PurchaseOrderItemInput]


class PurchaseOrder(BaseModel):
    id: UUID
    vendor_id: UUID
    state: POState
    currency: str
    expected_delivery_date: date | None = None
    decision_id: UUID | None = None
    approval_id: UUID | None = None
    external_reference: str | None = None
    subtotal: Decimal
    delivery_fee: Decimal = Decimal("0")
    tax: Decimal = Decimal("0")
    total: Decimal
    items: list[dict[str, Any]] = []
    created_at: datetime | None = None


class AcknowledgementItemInput(BaseModel):
    purchase_order_item_id: UUID | None = None
    status: str
    acknowledged_quantity: Decimal | None = None
    acknowledged_unit_price: Decimal | None = None
    substitution_name: str | None = None
    delivery_date: date | None = None
    change_reason: str | None = None


class SupplierAcknowledgementCreate(BaseModel):
    purchase_order_id: UUID
    vendor_id: UUID
    status: str
    delivery_date: date | None = None
    external_reference: str | None = None
    items: list[AcknowledgementItemInput] = []


class GoodsReceiptItemInput(BaseModel):
    purchase_order_item_id: UUID | None = None
    inventory_item_id: UUID | None = None
    canonical_ingredient_id: UUID | None = None
    received_quantity: Decimal
    rejected_quantity: Decimal = Decimal("0")
    uom: str = "unit"
    lot_code: str | None = None
    expiry_date: date | None = None
    substitution_name: str | None = None
    condition: str | None = None


class GoodsReceiptCreate(BaseModel):
    purchase_order_id: UUID | None = None
    vendor_id: UUID | None = None
    receipt_date: date = Field(default_factory=date.today)
    status: str = "RECEIVED"
    notes: str | None = None
    items: list[GoodsReceiptItemInput]


class SupplierInvoiceItemInput(BaseModel):
    purchase_order_item_id: UUID | None = None
    name: str
    quantity: Decimal
    unit_price: Decimal


class SupplierInvoiceCreate(BaseModel):
    document_id: UUID | None = None
    vendor_id: UUID | None = None
    purchase_order_id: UUID | None = None
    goods_receipt_id: UUID | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    currency: str = "USD"
    delivery_fee: Decimal = Decimal("0")
    tax: Decimal = Decimal("0")
    items: list[SupplierInvoiceItemInput]


class ReconciliationIssue(BaseModel):
    issue_type: str
    severity: str = "review"
    message: str
    evidence: dict[str, Any] = {}


class ReconciliationResult(BaseModel):
    status: Literal["MATCHED", "WITHIN_TOLERANCE", "REVIEW", "DISPUTE"]
    issues: list[ReconciliationIssue]
    summary: dict[str, Any]


class PurchasingSummary(BaseModel):
    purchase_orders: list[PurchaseOrder]
    goods_receipts: list[dict[str, Any]]
    invoices: list[dict[str, Any]]
    exceptions: list[dict[str, Any]]
