from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.purchasing import (
    GoodsReceiptCreate,
    PurchaseOrder,
    PurchaseOrderCreate,
    ReconciliationIssue,
    ReconciliationResult,
    SupplierAcknowledgementCreate,
    SupplierInvoiceCreate,
)
from app.services.inventory_ledger_service import InventoryLedgerService


class PurchasingService:
    def __init__(self) -> None:
        self.ledger = InventoryLedgerService()

    async def create_purchase_order(self, tenant: TenantContext, payload: PurchaseOrderCreate) -> PurchaseOrder:
        client = await get_async_supabase_admin()
        subtotal = sum((item.quantity * item.unit_price for item in payload.items), Decimal("0"))
        po_resp = await client.table("purchase_orders").insert({
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "vendor_id": str(payload.vendor_id),
            "state": "DRAFT",
            "currency": payload.currency,
            "pricing_snapshot": payload.pricing_snapshot,
            "commercial_snapshot": payload.commercial_snapshot,
            "expected_delivery_date": payload.expected_delivery_date.isoformat() if payload.expected_delivery_date else None,
            "decision_id": str(payload.decision_id) if payload.decision_id else None,
            "approval_id": str(payload.approval_id) if payload.approval_id else None,
            "external_reference": payload.external_reference,
            "subtotal": str(subtotal),
            "total": str(subtotal),
        }).execute()
        po = po_resp.data[0]
        item_rows = [
            {
                "purchase_order_id": po["id"],
                "organization_id": str(tenant.org_id),
                "canonical_ingredient_id": str(item.canonical_ingredient_id) if item.canonical_ingredient_id else None,
                "inventory_item_id": str(item.inventory_item_id) if item.inventory_item_id else None,
                "supplier_item_offer_id": str(item.supplier_item_offer_id) if item.supplier_item_offer_id else None,
                "name": item.name,
                "quantity": str(item.quantity),
                "uom": item.uom,
                "unit_price": str(item.unit_price),
                "line_total": str(item.quantity * item.unit_price),
                "commercial_snapshot": item.commercial_snapshot,
            }
            for item in payload.items
        ]
        items_resp = await client.table("purchase_order_items").insert(item_rows).execute()
        await self._event(client, tenant, UUID(str(po["id"])), "created", None, "DRAFT", {})
        po["items"] = items_resp.data or []
        return self._po(po)

    async def transition_po(self, tenant: TenantContext, po_id: UUID, next_state: str, payload: dict[str, Any] | None = None) -> None:
        client = await get_async_supabase_admin()
        current_resp = await client.table("purchase_orders").select("*").eq("id", str(po_id)).eq("organization_id", str(tenant.org_id)).eq("property_id", str(tenant.property_id)).limit(1).execute()
        current = current_resp.data[0]
        await client.table("purchase_orders").update({"state": next_state}).eq("id", str(po_id)).eq("organization_id", str(tenant.org_id)).execute()
        await self._event(client, tenant, po_id, "state_changed", current.get("state"), next_state, payload or {})

    async def acknowledge(self, tenant: TenantContext, payload: SupplierAcknowledgementCreate) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        ack_resp = await client.table("supplier_acknowledgements").insert({
            "purchase_order_id": str(payload.purchase_order_id),
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "vendor_id": str(payload.vendor_id),
            "status": payload.status,
            "delivery_date": payload.delivery_date.isoformat() if payload.delivery_date else None,
            "external_reference": payload.external_reference,
        }).execute()
        ack = ack_resp.data[0]
        if payload.items:
            await client.table("supplier_acknowledgement_items").insert([
                {
                    "acknowledgement_id": ack["id"],
                    "purchase_order_item_id": str(item.purchase_order_item_id) if item.purchase_order_item_id else None,
                    "organization_id": str(tenant.org_id),
                    "status": item.status,
                    "acknowledged_quantity": str(item.acknowledged_quantity) if item.acknowledged_quantity is not None else None,
                    "acknowledged_unit_price": str(item.acknowledged_unit_price) if item.acknowledged_unit_price is not None else None,
                    "substitution_name": item.substitution_name,
                    "delivery_date": item.delivery_date.isoformat() if item.delivery_date else None,
                    "change_reason": item.change_reason,
                }
                for item in payload.items
            ]).execute()
        next_state = "ACKNOWLEDGED" if payload.status == "accepted" else "PARTIALLY_CONFIRMED"
        if any(item.status != "accepted" for item in payload.items):
            next_state = "PARTIALLY_CONFIRMED"
        await self.transition_po(tenant, payload.purchase_order_id, next_state, {"acknowledgement_id": ack["id"]})
        return ack

    async def receive_goods(self, tenant: TenantContext, payload: GoodsReceiptCreate) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        receipt_resp = await client.table("goods_receipts").insert({
            "purchase_order_id": str(payload.purchase_order_id) if payload.purchase_order_id else None,
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "vendor_id": str(payload.vendor_id) if payload.vendor_id else None,
            "receipt_date": payload.receipt_date.isoformat(),
            "status": payload.status,
            "received_by_id": str(tenant.user_id),
            "notes": payload.notes,
        }).execute()
        receipt = receipt_resp.data[0]
        rows = []
        for item in payload.items:
            row = {
                "goods_receipt_id": receipt["id"],
                "purchase_order_item_id": str(item.purchase_order_item_id) if item.purchase_order_item_id else None,
                "organization_id": str(tenant.org_id),
                "inventory_item_id": str(item.inventory_item_id) if item.inventory_item_id else None,
                "canonical_ingredient_id": str(item.canonical_ingredient_id) if item.canonical_ingredient_id else None,
                "received_quantity": str(item.received_quantity),
                "rejected_quantity": str(item.rejected_quantity),
                "uom": item.uom,
                "lot_code": item.lot_code,
                "expiry_date": item.expiry_date.isoformat() if item.expiry_date else None,
                "substitution_name": item.substitution_name,
                "condition": item.condition,
            }
            rows.append(row)
            if item.inventory_item_id and item.received_quantity > 0:
                await self.ledger.apply_purchase(
                    tenant=tenant,
                    item_id=item.inventory_item_id,
                    quantity=float(item.received_quantity),
                    unit=item.uom,
                    idempotency_key=f"goods-receipt:{receipt['id']}:{item.inventory_item_id}",
                )
        if rows:
            await client.table("goods_receipt_items").insert(rows).execute()
        if payload.purchase_order_id:
            await self.transition_po(tenant, payload.purchase_order_id, "RECEIVED", {"goods_receipt_id": receipt["id"]})
        return receipt

    async def create_invoice(self, tenant: TenantContext, payload: SupplierInvoiceCreate) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        subtotal = sum((item.quantity * item.unit_price for item in payload.items), Decimal("0"))
        total = subtotal + payload.delivery_fee + payload.tax
        inv_resp = await client.table("supplier_invoices").insert({
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "document_id": str(payload.document_id) if payload.document_id else None,
            "vendor_id": str(payload.vendor_id) if payload.vendor_id else None,
            "purchase_order_id": str(payload.purchase_order_id) if payload.purchase_order_id else None,
            "goods_receipt_id": str(payload.goods_receipt_id) if payload.goods_receipt_id else None,
            "invoice_number": payload.invoice_number,
            "invoice_date": payload.invoice_date.isoformat() if payload.invoice_date else None,
            "currency": payload.currency,
            "subtotal": str(subtotal),
            "delivery_fee": str(payload.delivery_fee),
            "tax": str(payload.tax),
            "total": str(total),
        }).execute()
        inv = inv_resp.data[0]
        if payload.items:
            await client.table("supplier_invoice_items").insert([
                {
                    "supplier_invoice_id": inv["id"],
                    "purchase_order_item_id": str(item.purchase_order_item_id) if item.purchase_order_item_id else None,
                    "organization_id": str(tenant.org_id),
                    "name": item.name,
                    "quantity": str(item.quantity),
                    "unit_price": str(item.unit_price),
                    "line_total": str(item.quantity * item.unit_price),
                }
                for item in payload.items
            ]).execute()
        return inv

    def reconcile(self, po_items: list[dict[str, Any]], receipt_items: list[dict[str, Any]], invoice_items: list[dict[str, Any]], *, delivery_fee_po: Decimal = Decimal("0"), delivery_fee_invoice: Decimal = Decimal("0"), tax_expected: Decimal = Decimal("0"), tax_invoice: Decimal = Decimal("0"), tolerance: Decimal = Decimal("0.01")) -> ReconciliationResult:
        issues: list[ReconciliationIssue] = []
        by_po = {str(item.get("id")): item for item in po_items}
        receipt_by_po: dict[str, Decimal] = {}
        invoice_by_po: dict[str, dict[str, Decimal]] = {}
        for item in receipt_items:
            key = str(item.get("purchase_order_item_id"))
            receipt_by_po[key] = receipt_by_po.get(key, Decimal("0")) + Decimal(str(item.get("received_quantity") or 0))
        for item in invoice_items:
            key = str(item.get("purchase_order_item_id"))
            invoice_by_po[key] = {"quantity": Decimal(str(item.get("quantity") or 0)), "unit_price": Decimal(str(item.get("unit_price") or 0))}
            if key not in by_po:
                issues.append(ReconciliationIssue(issue_type="unexpected_item", message=f"Unexpected invoice item {item.get('name')}", evidence=item))
        for key, po in by_po.items():
            ordered = Decimal(str(po.get("quantity") or 0))
            po_price = Decimal(str(po.get("unit_price") or 0))
            received = receipt_by_po.get(key, Decimal("0"))
            invoiced = invoice_by_po.get(key)
            if received < ordered:
                issues.append(ReconciliationIssue(issue_type="short_delivery", message=f"Received {received} of {ordered}", evidence={"po_item_id": key}))
            if invoiced is None:
                issues.append(ReconciliationIssue(issue_type="missing_item", message=f"Missing invoice item {po.get('name')}", evidence={"po_item_id": key}))
                continue
            if abs(invoiced["quantity"] - received) > tolerance:
                issues.append(ReconciliationIssue(issue_type="quantity_mismatch", message="Invoice quantity differs from receipt", evidence={"po_item_id": key, "invoice": str(invoiced["quantity"]), "received": str(received)}))
            if abs(invoiced["unit_price"] - po_price) > tolerance:
                issues.append(ReconciliationIssue(issue_type="price_mismatch", message="Invoice price differs from PO", evidence={"po_item_id": key, "invoice": str(invoiced["unit_price"]), "po": str(po_price)}))
        if abs(delivery_fee_invoice - delivery_fee_po) > tolerance:
            issues.append(ReconciliationIssue(issue_type="delivery_fee_variance", message="Delivery fee differs from PO", evidence={"invoice": str(delivery_fee_invoice), "po": str(delivery_fee_po)}))
        if abs(tax_invoice - tax_expected) > tolerance:
            issues.append(ReconciliationIssue(issue_type="tax_discrepancy", message="Tax differs from expected", evidence={"invoice": str(tax_invoice), "expected": str(tax_expected)}))
        status = "MATCHED" if not issues else "WITHIN_TOLERANCE" if all(i.severity == "info" for i in issues) else "REVIEW"
        if any(i.issue_type in {"unexpected_item", "price_mismatch", "quantity_mismatch"} for i in issues):
            status = "DISPUTE"
        return ReconciliationResult(status=status, issues=issues, summary={"issue_count": len(issues)})

    async def summary(self, tenant: TenantContext) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        purchase_orders = await self._fetch(client, "purchase_orders", "*,items:purchase_order_items(*)", tenant, "created_at")
        receipts = await self._fetch(client, "goods_receipts", "*", tenant, "created_at")
        invoices = await self._fetch(client, "supplier_invoices", "*", tenant, "created_at")
        cases = await self._fetch(client, "reconciliation_cases", "*", tenant, "created_at")
        return {"purchase_orders": [self._po(row).model_dump() for row in purchase_orders], "goods_receipts": receipts, "invoices": invoices, "exceptions": cases}

    async def _event(self, client: Any, tenant: TenantContext, po_id: UUID, event_type: str, previous: str | None, next_state: str | None, payload: dict[str, Any]) -> None:
        await client.table("purchase_order_events").insert({"purchase_order_id": str(po_id), "organization_id": str(tenant.org_id), "event_type": event_type, "previous_state": previous, "next_state": next_state, "payload": payload, "actor_id": str(tenant.user_id)}).execute()

    async def _fetch(self, client: Any, table: str, select: str, tenant: TenantContext, order_by: str) -> list[dict[str, Any]]:
        resp = await client.table(table).select(select).eq("organization_id", str(tenant.org_id)).eq("property_id", str(tenant.property_id)).order(order_by, desc=True).limit(100).execute()
        return resp.data or []

    def _po(self, row: dict[str, Any]) -> PurchaseOrder:
        return PurchaseOrder(
            id=UUID(str(row["id"])),
            vendor_id=UUID(str(row["vendor_id"])),
            state=row.get("state", "DRAFT"),
            currency=row.get("currency", "USD"),
            expected_delivery_date=row.get("expected_delivery_date"),
            decision_id=UUID(str(row["decision_id"])) if row.get("decision_id") else None,
            approval_id=UUID(str(row["approval_id"])) if row.get("approval_id") else None,
            external_reference=row.get("external_reference"),
            subtotal=Decimal(str(row.get("subtotal") or 0)),
            delivery_fee=Decimal(str(row.get("delivery_fee") or 0)),
            tax=Decimal(str(row.get("tax") or 0)),
            total=Decimal(str(row.get("total") or 0)),
            items=row.get("items") or [],
            created_at=row.get("created_at"),
        )
