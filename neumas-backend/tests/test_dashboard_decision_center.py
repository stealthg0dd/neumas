from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.inventory import InventoryItemResponse
from app.services.decision_center_service import DecisionCenterService
from app.services.inventory_intelligence_service import InventoryIntelligenceService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="admin",
        jwt="test-jwt",
    )


@pytest.mark.asyncio
async def test_decision_center_prioritizes_review_then_reorder_then_activation(tenant: TenantContext):
    service = DecisionCenterService()

    async def fake_fetch_rows(_client, table: str, *_args, **_kwargs):
        if table == "documents":
            return [{"id": str(uuid4()), "review_needed": True}]
        if table == "alerts":
            return [{"id": str(uuid4()), "alert_type": "predicted_stockout", "title": "Milk predicted to stock out"}]
        if table == "shopping_lists":
            return [{"id": str(uuid4()), "status": "awaiting_approval", "total_estimated_cost": 184}]
        return []

    with (
        patch("app.services.decision_center_service.get_async_supabase_admin", new=AsyncMock(return_value=object())),
        patch.object(service, "_fetch_rows", side_effect=fake_fetch_rows),
        patch.object(service, "_fetch_single", new=AsyncMock(return_value={"activation_milestones": {"first_document_uploaded": False}})),
    ):
        payload = await service.build(tenant)

    assert payload.action_queue[0].action_type == "review_required"
    assert payload.action_queue[1].action_type == "critical_stockout"
    assert any(action.action_type == "reorder_approval" for action in payload.action_queue)
    assert payload.next_best_action.action_type == "review_required"


@pytest.mark.asyncio
async def test_inventory_intelligence_includes_prediction_and_reorder_timeline(tenant: TenantContext):
    service = InventoryIntelligenceService()
    item_id = uuid4()
    now = datetime.now(UTC)
    item = InventoryItemResponse(
        id=item_id,
        property_id=tenant.property_id,
        name="Milk",
        description=None,
        sku=None,
        barcode=None,
        unit="unit",
        quantity=Decimal("4"),
        min_quantity=Decimal("2"),
        max_quantity=None,
        reorder_point=Decimal("2"),
        cost_per_unit=Decimal("3.50"),
        supplier_info={"name": "Fresh Foods"},
        metadata={},
        is_active=True,
        last_scanned_at=now,
        created_at=now,
        updated_at=now,
        category=None,
        vendor_id=None,
        average_daily_usage=Decimal("1.5"),
        auto_reorder_enabled=False,
        safety_buffer=Decimal("0"),
    )

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Query:
        def __init__(self, rows):
            self.rows = rows

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        async def execute(self):
            return _Resp(self.rows)

    class _FakeClient:
        def __init__(self):
            self.shopping_list_id = str(uuid4())

        def table(self, name: str):
            if name == "predictions":
                return _Query([{
                    "id": str(uuid4()),
                    "prediction_date": now.isoformat(),
                    "predicted_depletion_date": now.isoformat(),
                    "confidence": 0.88,
                    "features_used": {},
                }])
            if name == "shopping_list_items":
                return _Query([{
                    "id": str(uuid4()),
                    "shopping_list_id": self.shopping_list_id,
                    "created_at": now.isoformat(),
                }])
            if name == "shopping_lists":
                return _Query([{
                    "id": self.shopping_list_id,
                    "status": "awaiting_approval",
                    "updated_at": now.isoformat(),
                }])
            return _Query([])

    fake_client = _FakeClient()

    with (
        patch.object(service._inventory, "get_item", new=AsyncMock(return_value=item)),
        patch.object(service._movements, "list_for_item", new=AsyncMock(return_value=[{
            "movement_type": "purchase",
            "quantity_delta": 4,
            "unit": "unit",
            "created_at": now.isoformat(),
            "reference_id": str(uuid4()),
            "reference_type": "document",
        }])),
        patch("app.services.inventory_intelligence_service.get_async_supabase_admin", new=AsyncMock(return_value=fake_client)),
    ):
        payload = await service.get_item_intelligence(item_id, tenant)

    assert payload is not None
    assert payload.supplier_name == "Fresh Foods"
    assert payload.predicted_depletion_at is not None
    assert any(event.event_type == "purchase" for event in payload.timeline)


@pytest.mark.asyncio
async def test_decision_center_latest_activity_falls_back_to_receipt_total_and_items_detected(tenant: TenantContext):
    service = DecisionCenterService()

    async def fake_fetch_rows(_client, table: str, *_args, **_kwargs):
        if table == "scans":
            return [{
                "id": str(uuid4()),
                "status": "inventory_posted",
                "items_detected": 19,
                "processed_results": {
                    "receipt_metadata": {
                        "vendor_name": "Acme Foods",
                        "receipt_total": "184.50",
                    },
                    "stage_details": {},
                },
                "created_at": datetime.now(UTC).isoformat(),
            }]
        return []

    with (
        patch("app.services.decision_center_service.get_async_supabase_admin", new=AsyncMock(return_value=object())),
        patch.object(service, "_fetch_rows", side_effect=fake_fetch_rows),
        patch.object(service, "_fetch_single", new=AsyncMock(return_value={"activation_milestones": {"first_document_uploaded": True}})),
    ):
        payload = await service.build(tenant)

    assert payload.latest_activity is not None
    assert payload.latest_activity.items_updated == 19
    assert payload.latest_activity.supplier_name == "Acme Foods"
    assert float(payload.latest_activity.invoice_total or 0) == 184.50
    assert payload.latest_activity.downstream_status == "pending"
