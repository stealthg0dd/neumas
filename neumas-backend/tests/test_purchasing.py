from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.purchasing import (
    GoodsReceiptCreate,
    GoodsReceiptItemInput,
    PurchaseOrderCreate,
    PurchaseOrderItemInput,
    SupplierAcknowledgementCreate,
    SupplierInvoiceCreate,
    SupplierInvoiceItemInput,
)
from app.services.purchasing_service import PurchasingService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(user_id=uuid4(), org_id=uuid4(), property_id=uuid4(), role="admin", jwt="test")


class Resp:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = []
        self.pending = None

    def select(self, *_args):
        return self

    def eq(self, key, value):
        self.filters.append((key, str(value)))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def insert(self, payload):
        rows = payload if isinstance(payload, list) else [payload]
        out = []
        for row in rows:
            row = dict(row)
            row.setdefault("id", str(uuid4()))
            self.client.rows.setdefault(self.table, []).append(row)
            out.append(row)
        self.client.inserts.append((self.table, out))
        self.pending = out
        return self

    def update(self, payload):
        for row in self.client.rows.get(self.table, []):
            if all(str(row.get(k)) == v for k, v in self.filters):
                row.update(payload)
        self.client.updates.append((self.table, payload))
        return self

    async def execute(self):
        if self.pending is not None:
            return Resp(self.pending)
        rows = list(self.client.rows.get(self.table, []))
        for key, value in self.filters:
            rows = [row for row in rows if str(row.get(key)) == value]
        return Resp(rows)


class Client:
    def __init__(self):
        self.rows = {}
        self.inserts = []
        self.updates = []

    def table(self, table):
        return Query(self, table)


@pytest.mark.asyncio
async def test_full_local_procurement_lifecycle(monkeypatch, tenant: TenantContext):
    client = Client()
    ledger = AsyncMock(return_value={"id": str(uuid4())})
    monkeypatch.setattr("app.services.purchasing_service.get_async_supabase_admin", AsyncMock(return_value=client))
    service = PurchasingService()
    monkeypatch.setattr(service.ledger, "apply_purchase", ledger)
    vendor_id = uuid4()
    inventory_id = uuid4()
    po = await service.create_purchase_order(tenant, PurchaseOrderCreate(
        vendor_id=vendor_id,
        items=[PurchaseOrderItemInput(name="Chicken", quantity=Decimal("10"), unit_price=Decimal("5"), inventory_item_id=inventory_id)],
    ))
    item_id = po.items[0]["id"]
    await service.transition_po(tenant, po.id, "PENDING_APPROVAL")
    await service.transition_po(tenant, po.id, "APPROVED")
    await service.acknowledge(tenant, SupplierAcknowledgementCreate(purchase_order_id=po.id, vendor_id=vendor_id, status="accepted"))
    receipt = await service.receive_goods(tenant, GoodsReceiptCreate(
        purchase_order_id=po.id,
        vendor_id=vendor_id,
        items=[GoodsReceiptItemInput(purchase_order_item_id=item_id, inventory_item_id=inventory_id, received_quantity=Decimal("10"))],
    ))
    invoice = await service.create_invoice(tenant, SupplierInvoiceCreate(
        vendor_id=vendor_id,
        purchase_order_id=po.id,
        goods_receipt_id=receipt["id"],
        invoice_number="INV-1",
        items=[SupplierInvoiceItemInput(purchase_order_item_id=item_id, name="Chicken", quantity=Decimal("10"), unit_price=Decimal("5"))],
    ))
    result = service.reconcile(po.items, [{"purchase_order_item_id": item_id, "received_quantity": "10"}], [{"purchase_order_item_id": item_id, "name": "Chicken", "quantity": "10", "unit_price": "5"}])
    assert invoice["total"] == "50"
    assert result.status == "MATCHED"
    ledger.assert_awaited_once()


def test_partial_and_failed_three_way_match_paths():
    service = PurchasingService()
    po_item = {"id": "line-1", "name": "Fish", "quantity": "10", "unit_price": "4"}
    result = service.reconcile(
        [po_item],
        [{"purchase_order_item_id": "line-1", "received_quantity": "7"}],
        [{"purchase_order_item_id": "line-1", "name": "Fish", "quantity": "7", "unit_price": "5"}],
        delivery_fee_po=Decimal("5"),
        delivery_fee_invoice=Decimal("8"),
    )
    issue_types = {issue.issue_type for issue in result.issues}
    assert result.status == "DISPUTE"
    assert "short_delivery" in issue_types
    assert "price_mismatch" in issue_types
    assert "delivery_fee_variance" in issue_types
