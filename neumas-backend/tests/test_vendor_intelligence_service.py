from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.services.vendor_intelligence_service import VendorIntelligenceService


class _Resp:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, db: _FakeClient, name: str):
        self.db = db
        self.name = name
        self.filters: list[tuple[str, str, object]] = []
        self.payload = None
        self.mode = "select"
        self.limit_n: int | None = None
        self.order_key: str | None = None
        self.single_mode = False

    def select(self, *_args, **_kwargs):
        self.mode = "select"
        return self

    def insert(self, payload):
        self.mode = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.mode = "update"
        self.payload = payload
        return self

    def eq(self, key: str, value: object):
        self.filters.append(("eq", key, value))
        return self

    def limit(self, n: int):
        self.limit_n = n
        return self

    def order(self, key: str, *_args, **_kwargs):
        self.order_key = key
        return self

    def single(self):
        self.single_mode = True
        return self

    async def execute(self):
        if self.mode == "insert":
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for row in rows:
                record = dict(row)
                record.setdefault("id", str(uuid4()))
                self.db.rows[self.name].append(record)
                inserted.append(record)
            return _Resp(inserted)
        if self.mode == "update":
            updated = []
            for row in self.db.rows[self.name]:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(dict(row))
            return _Resp(updated)

        rows = [dict(row) for row in self.db.rows[self.name] if self._matches(row)]
        if self.order_key:
            rows.sort(key=lambda row: str(row.get(self.order_key) or ""))
        if self.limit_n is not None:
            rows = rows[: self.limit_n]
        if self.single_mode:
            return _Resp(rows[0] if rows else None)
        return _Resp(rows)

    def _matches(self, row: dict) -> bool:
        for operator, key, value in self.filters:
            if operator == "eq" and row.get(key) != value:
                return False
        return True


class _FakeClient:
    def __init__(self) -> None:
        self.rows = {
            "documents": [],
            "document_line_items": [],
            "inventory_items": [],
            "item_price_history": [],
            "alerts": [],
        }

    def table(self, name: str):
        return _Table(self, name)


def _tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )


@pytest.mark.asyncio
async def test_records_price_observation_once_and_links_vendor_context():
    tenant = _tenant()
    client = _FakeClient()
    vendor_id = str(uuid4())
    item_id = str(uuid4())
    document_id = str(uuid4())
    line_item_id = str(uuid4())

    client.rows["documents"].append(
        {
            "id": document_id,
            "organization_id": str(tenant.org_id),
            "raw_vendor_name": "Fresh Foods",
            "overall_confidence": 0.94,
            "created_at": datetime.now(UTC).isoformat(),
            "approved_at": datetime.now(UTC).isoformat(),
        }
    )
    client.rows["document_line_items"].append(
        {
            "id": line_item_id,
            "organization_id": str(tenant.org_id),
            "raw_name": "Milk",
            "raw_quantity": 4,
            "raw_unit": "unit",
            "raw_price": 3.5,
            "normalized_name": "Milk",
            "normalized_quantity": 4,
            "normalized_unit": "unit",
            "unit_price": 3.5,
        }
    )
    client.rows["inventory_items"].append(
        {
            "id": item_id,
            "property_id": str(tenant.property_id),
            "organization_id": str(tenant.org_id),
            "vendor_id": None,
            "supplier_info": {},
            "cost_per_unit": None,
        }
    )

    with (
        patch("app.services.vendor_intelligence_service.get_async_supabase_admin", new=AsyncMock(return_value=client)),
        patch(
            "app.services.vendor_intelligence_service.VendorService.normalise",
            new=AsyncMock(return_value={"id": vendor_id, "name": "Fresh Foods"}),
        ),
        patch("app.services.vendor_intelligence_service.AlertsRepository.list", new=AsyncMock(return_value=[])),
        patch("app.services.vendor_intelligence_service.AlertsRepository.create", new=AsyncMock(return_value={"id": str(uuid4())})),
    ):
        service = VendorIntelligenceService()
        first = await service.enrich_purchase_document(
            tenant,
            document=client.rows["documents"][0],
            line_items=client.rows["document_line_items"],
            item_links={line_item_id: item_id},
        )
        second = await service.enrich_purchase_document(
            tenant,
            document=client.rows["documents"][0],
            line_items=client.rows["document_line_items"],
            item_links={line_item_id: item_id},
        )

    assert first["price_observations_recorded"] == 1
    assert second["price_observations_recorded"] == 0
    assert first["vendor_name"] == "Fresh Foods"
    assert client.rows["inventory_items"][0]["vendor_id"] == vendor_id
    assert client.rows["inventory_items"][0]["supplier_info"]["name"] == "Fresh Foods"
    assert len(client.rows["item_price_history"]) == 1


@pytest.mark.asyncio
async def test_low_confidence_vendor_resolution_creates_review_alert_without_price_history():
    tenant = _tenant()
    client = _FakeClient()
    item_id = str(uuid4())
    document_id = str(uuid4())
    line_item_id = str(uuid4())

    client.rows["documents"].append(
        {
            "id": document_id,
            "organization_id": str(tenant.org_id),
            "raw_vendor_name": "Unclear Store",
            "overall_confidence": 0.4,
            "created_at": datetime.now(UTC).isoformat(),
            "approved_at": datetime.now(UTC).isoformat(),
        }
    )
    client.rows["document_line_items"].append(
        {
            "id": line_item_id,
            "organization_id": str(tenant.org_id),
            "raw_name": "Oil",
            "raw_quantity": 2,
            "raw_unit": "bottle",
            "raw_price": 7.5,
        }
    )
    client.rows["inventory_items"].append(
        {
            "id": item_id,
            "property_id": str(tenant.property_id),
            "organization_id": str(tenant.org_id),
            "vendor_id": None,
            "supplier_info": {},
            "cost_per_unit": None,
        }
    )

    with (
        patch("app.services.vendor_intelligence_service.get_async_supabase_admin", new=AsyncMock(return_value=client)),
        patch(
            "app.services.vendor_intelligence_service.VendorService.normalise",
            new=AsyncMock(return_value=None),
        ),
        patch("app.services.vendor_intelligence_service.AlertsRepository.list", new=AsyncMock(return_value=[])),
        patch("app.services.vendor_intelligence_service.AlertsRepository.create", new=AsyncMock(return_value={"id": str(uuid4())})) as mock_alert_create,
    ):
        service = VendorIntelligenceService()
        result = await service.enrich_purchase_document(
            tenant,
            document=client.rows["documents"][0],
            line_items=client.rows["document_line_items"],
            item_links={line_item_id: item_id},
        )

    assert result["vendor_review_required"] is True
    assert result["price_observations_recorded"] == 0
    assert mock_alert_create.await_count == 1
