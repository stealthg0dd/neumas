from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.api.deps import TenantContext
from app.services.reorder_lifecycle_service import ReorderLifecycleService
from app.services.reorder_service import ReorderService


class _FakeShoppingRepo:
    def __init__(self) -> None:
        self.lists: dict[str, dict] = {}
        self.items: dict[str, list[dict]] = defaultdict(list)
        self.transitions: list[dict] = []

    async def get_by_property(self, tenant: TenantContext, status: str | None = None, limit: int = 50, offset: int = 0) -> list[dict]:
        rows = [
            self._with_items(row)
            for row in self.lists.values()
            if row["property_id"] == str(tenant.property_id)
        ]
        if status:
            rows = [row for row in rows if row.get("status") == status]
        rows.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
        return rows[offset : offset + limit]

    async def get_by_id(self, tenant: TenantContext, list_id):
        row = self.lists.get(str(list_id))
        if row is None or row["property_id"] != str(tenant.property_id):
            return None
        return self._with_items(row)

    async def create(self, tenant: TenantContext, data: dict):
        list_id = str(data.get("id") or uuid4())
        now = datetime.now(UTC).isoformat()
        row = {
            "id": list_id,
            "property_id": str(tenant.property_id),
            "organization_id": data.get("organization_id", str(tenant.org_id)),
            "created_by_id": str(tenant.user_id),
            "name": data["name"],
            "status": data.get("status", "draft"),
            "notes": data.get("notes"),
            "budget_limit": data.get("budget_limit"),
            "currency": data.get("currency", "USD"),
            "generation_params": data.get("generation_params", {}),
            "source_prediction_ids": data.get("source_prediction_ids", []),
            "total_estimated_cost": data.get("total_estimated_cost"),
            "total_actual_cost": data.get("total_actual_cost"),
            "approved_at": data.get("approved_at"),
            "approved_by_id": data.get("approved_by_id"),
            "status_reason": data.get("status_reason"),
            "last_transition_at": data.get("last_transition_at"),
            "last_transition_by_id": data.get("last_transition_by_id"),
            "created_at": now,
            "updated_at": now,
        }
        self.lists[list_id] = row
        return row

    async def update(self, tenant: TenantContext, list_id, data: dict):
        row = self.lists[str(list_id)]
        row.update(data)
        row["updated_at"] = datetime.now(UTC).isoformat()
        return row

    async def add_items_batch(self, tenant: TenantContext, list_id, items: list[dict]):
        list_id_str = str(list_id)
        stored = []
        for item in items:
            row = {
                "id": str(item.get("id") or uuid4()),
                "shopping_list_id": list_id_str,
                "inventory_item_id": item.get("inventory_item_id"),
                "prediction_id": item.get("prediction_id"),
                "name": item["name"],
                "quantity": item["quantity"],
                "unit": item.get("unit", "unit"),
                "estimated_price": item.get("estimated_price"),
                "actual_price": item.get("actual_price"),
                "priority": item.get("priority", "normal"),
                "reason": item.get("reason"),
                "source": item.get("source", "prediction"),
                "is_purchased": item.get("is_purchased", False),
                "purchased_at": item.get("purchased_at"),
                "received_quantity": item.get("received_quantity", 0),
                "received_at": item.get("received_at"),
                "receipt_idempotency_key": item.get("receipt_idempotency_key"),
                "created_at": datetime.now(UTC).isoformat(),
            }
            stored.append(row)
        self.items[list_id_str] = stored
        return stored

    async def delete_items(self, tenant: TenantContext, list_id):
        self.items[str(list_id)] = []

    async def update_totals(self, tenant: TenantContext, list_id):
        rows = self.items[str(list_id)]
        estimated_total = Decimal("0")
        actual_total = Decimal("0")
        for row in rows:
            qty = Decimal(str(row.get("quantity") or 0))
            if row.get("estimated_price") is not None:
                estimated_total += qty * Decimal(str(row["estimated_price"]))
            if row.get("actual_price") is not None:
                actual_total += qty * Decimal(str(row["actual_price"]))
        self.lists[str(list_id)]["total_estimated_cost"] = float(estimated_total)
        self.lists[str(list_id)]["total_actual_cost"] = float(actual_total)
        return self.lists[str(list_id)]

    async def get_items(self, tenant: TenantContext, list_id):
        return [dict(row) for row in self.items[str(list_id)]]

    async def get_item(self, tenant: TenantContext, list_id, item_id):
        for row in self.items[str(list_id)]:
            if row["id"] == str(item_id):
                return row
        return None

    async def update_item(self, tenant: TenantContext, list_id, item_id, data: dict):
        for row in self.items[str(list_id)]:
            if row["id"] == str(item_id):
                row.update(data)
                return row
        raise ValueError("item not found")

    async def create_transition(self, tenant: TenantContext, data: dict):
        row = dict(data)
        row["id"] = str(uuid4())
        row["created_at"] = datetime.now(UTC).isoformat()
        self.transitions.append(row)
        return row

    async def get_transition_by_idempotency(self, tenant: TenantContext, list_id, idempotency_key: str):
        for row in self.transitions:
            if row["shopping_list_id"] == str(list_id) and row["idempotency_key"] == idempotency_key:
                return row
        return None

    async def calculate_totals(self, tenant: TenantContext, list_id):
        rows = self.items[str(list_id)]
        purchased = sum(1 for row in rows if row.get("is_purchased"))
        return {
            "total_items": len(rows),
            "purchased_items": purchased,
            "estimated_total": self.lists[str(list_id)].get("total_estimated_cost") or 0,
            "actual_total": self.lists[str(list_id)].get("total_actual_cost") or 0,
            "completion_percentage": 0 if not rows else round(purchased / len(rows) * 100, 1),
        }

    def _with_items(self, row: dict) -> dict:
        return {**row, "items": [dict(item) for item in self.items[row["id"]]]}


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db: _FakeAdminClient, table: str):
        self.db = db
        self.table = table
        self.filters: list[tuple[str, str, object]] = []
        self.order_key: str | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key: str, value: object):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key: str, value: list[object]):
        self.filters.append(("in", key, value))
        return self

    def order(self, key: str, *_args, **_kwargs):
        self.order_key = key
        return self

    async def execute(self):
        rows = [dict(row) for row in self.db.rows[self.table] if self._matches(row)]
        if self.order_key:
            rows.sort(key=lambda row: str(row.get(self.order_key) or ""))
        return _Resp(rows)

    def _matches(self, row: dict) -> bool:
        for operator, key, value in self.filters:
            row_value = row.get(key)
            if operator == "eq" and row_value != value:
                return False
            if operator == "in" and row_value not in value:
                return False
        return True


class _FakeAdminClient:
    def __init__(self, *, inventory_items: list[dict], predictions: list[dict], vendors: list[dict] | None = None):
        self.rows = {
            "inventory_items": inventory_items,
            "predictions": predictions,
            "vendors": vendors or [],
        }

    def table(self, name: str):
        return _Query(self, name)


def _tenant(role: str = "staff") -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role=role,
        jwt="token",
    )


def _inventory_row(*, tenant: TenantContext, item_id: str, name: str, quantity: float, par_level: float = 10, vendor_id: str | None = None) -> dict:
    return {
        "id": item_id,
        "organization_id": str(tenant.org_id),
        "property_id": str(tenant.property_id),
        "vendor_id": vendor_id,
        "supplier_info": {"name": "Direct Supplier"} if vendor_id is None else {},
        "name": name,
        "quantity": quantity,
        "unit": "unit",
        "par_level": par_level,
        "reorder_point": par_level,
        "cost_per_unit": 3.5,
        "currency": "USD",
        "is_active": True,
    }


def _prediction_row(*, item_id: str, depletion_days: int, qty: float, prediction_type: str = "stockout", risk: str = "urgent") -> dict:
    pred_dt = datetime.now(UTC) + timedelta(days=depletion_days)
    return {
        "id": str(uuid4()),
        "property_id": "",
        "item_id": item_id,
        "inventory_item_id": item_id,
        "prediction_type": prediction_type,
        "prediction_date": pred_dt.isoformat(),
        "predicted_depletion_date": pred_dt.isoformat(),
        "predicted_value": qty,
        "predicted_quantity_needed": qty,
        "confidence": 0.82,
        "stockout_risk_level": risk,
        "source_data_window": {},
        "features_used": {},
    }


@pytest.mark.asyncio
async def test_qualifying_prediction_produces_actionable_plan():
    tenant = _tenant()
    repo = _FakeShoppingRepo()
    item_id = str(uuid4())
    prediction = _prediction_row(item_id=item_id, depletion_days=2, qty=12)
    prediction["property_id"] = str(tenant.property_id)
    admin = _FakeAdminClient(
        inventory_items=[_inventory_row(tenant=tenant, item_id=item_id, name="Milk", quantity=2)],
        predictions=[prediction],
    )

    with (
        patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.reorder_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
    ):
        result = await ReorderService().create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})

    assert result["result_code"] == "CREATED"
    assert result["shopping_list"]["status"] == "recommended"
    assert result["item_count"] == 1
    assert repo.items[result["shopping_list_id"]][0]["prediction_id"] == prediction["id"]


@pytest.mark.asyncio
async def test_duplicate_forecast_does_not_duplicate_plan():
    tenant = _tenant()
    repo = _FakeShoppingRepo()
    item_id = str(uuid4())
    prediction = _prediction_row(item_id=item_id, depletion_days=2, qty=12)
    prediction["property_id"] = str(tenant.property_id)
    admin = _FakeAdminClient(
        inventory_items=[_inventory_row(tenant=tenant, item_id=item_id, name="Milk", quantity=2)],
        predictions=[prediction],
    )

    with (
        patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.reorder_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
    ):
        service = ReorderService()
        first = await service.create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})
        second = await service.create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})

    assert first["result_code"] == "CREATED"
    assert second["result_code"] == "UPDATED"
    assert first["shopping_list_id"] == second["shopping_list_id"]
    assert len(repo.lists) == 1


@pytest.mark.asyncio
async def test_multiple_items_aggregate_into_single_plan():
    tenant = _tenant()
    repo = _FakeShoppingRepo()
    first_item = str(uuid4())
    second_item = str(uuid4())
    first_prediction = _prediction_row(item_id=first_item, depletion_days=2, qty=12)
    first_prediction["property_id"] = str(tenant.property_id)
    second_prediction = _prediction_row(item_id=second_item, depletion_days=1, qty=8, risk="critical")
    second_prediction["property_id"] = str(tenant.property_id)
    admin = _FakeAdminClient(
        inventory_items=[
            _inventory_row(tenant=tenant, item_id=first_item, name="Milk", quantity=2),
            _inventory_row(tenant=tenant, item_id=second_item, name="Eggs", quantity=1),
        ],
        predictions=[first_prediction, second_prediction],
    )

    with (
        patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.reorder_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
    ):
        result = await ReorderService().create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})

    assert result["item_count"] == 2
    assert len(repo.items[result["shopping_list_id"]]) == 2


@pytest.mark.asyncio
async def test_approval_modify_and_reject_use_existing_lifecycle():
    tenant = _tenant()
    repo = _FakeShoppingRepo()
    item_id = str(uuid4())
    prediction = _prediction_row(item_id=item_id, depletion_days=2, qty=12)
    prediction["property_id"] = str(tenant.property_id)
    admin = _FakeAdminClient(
        inventory_items=[_inventory_row(tenant=tenant, item_id=item_id, name="Milk", quantity=2)],
        predictions=[prediction],
    )

    with (
        patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.reorder_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
    ):
        result = await ReorderService().create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})
        list_id = uuid4() if result["shopping_list_id"] is None else UUID(result["shopping_list_id"])
        lifecycle = ReorderLifecycleService()
        approved = await lifecycle.transition_list(
            tenant, list_id, next_state="approved", idempotency_key="approve-test", reason="approve"
        )
        assert approved.shopping_list["status"] == "approved"
        modified = await lifecycle.transition_list(
            tenant, list_id, next_state="modified", idempotency_key="modify-test", reason="modify"
        )
        assert modified.shopping_list["status"] == "modified"

        repo.lists[str(list_id)]["status"] = "recommended"
        rejected = await lifecycle.transition_list(
            tenant, list_id, next_state="rejected", idempotency_key="reject-test", reason="reject"
        )
        assert rejected.shopping_list["status"] == "rejected"


@pytest.mark.asyncio
async def test_rejected_recommendation_does_not_regenerate_without_new_evidence():
    tenant = _tenant()
    repo = _FakeShoppingRepo()
    item_id = str(uuid4())
    prediction = _prediction_row(item_id=item_id, depletion_days=2, qty=12)
    prediction["property_id"] = str(tenant.property_id)
    admin = _FakeAdminClient(
        inventory_items=[_inventory_row(tenant=tenant, item_id=item_id, name="Milk", quantity=2)],
        predictions=[prediction],
    )

    with (
        patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.reorder_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
    ):
        service = ReorderService()
        created = await service.create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})
        list_id = UUID(created["shopping_list_id"])
        await ReorderLifecycleService().transition_list(
            tenant, list_id, next_state="rejected", idempotency_key="reject-test", reason="reject"
        )
        suppressed = await service.create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})

    assert suppressed["result_code"] == "NO_ELIGIBLE_ITEMS"
    assert len(repo.lists) == 1


@pytest.mark.asyncio
async def test_receive_posts_ledger_once_and_enqueues_prediction_evaluation():
    tenant = _tenant()
    repo = _FakeShoppingRepo()
    list_row = await repo.create(
        tenant,
        {
            "organization_id": str(tenant.org_id),
            "name": "Reorder Plan",
            "status": "approved",
            "source_prediction_ids": [str(uuid4())],
            "generation_params": {"plan_kind": "forecast_reorder"},
        },
    )
    item_id = str(uuid4())
    repo.items[list_row["id"]] = [
        {
            "id": item_id,
            "shopping_list_id": list_row["id"],
            "inventory_item_id": str(uuid4()),
            "prediction_id": str(uuid4()),
            "name": "Milk",
            "quantity": "5",
            "unit": "unit",
            "estimated_price": "3.5",
            "actual_price": None,
            "priority": "high",
            "reason": "Predicted stockout",
            "source": "prediction",
            "is_purchased": False,
            "receipt_idempotency_key": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
    ]

    with (
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
        patch("app.services.reorder_lifecycle_service.InventoryLedgerService.apply_purchase", new=AsyncMock(return_value=None)) as mock_ledger,
        patch("app.services.reorder_lifecycle_service.celery_app.send_task", new=MagicMock(return_value=None)) as mock_send_task,
    ):
        lifecycle = ReorderLifecycleService()
        await lifecycle.receive_item(
            tenant,
            UUID(list_row["id"]),
            UUID(item_id),
            quantity_received=Decimal("5"),
            idempotency_key="receipt-key-1",
        )
        await lifecycle.receive_item(
            tenant,
            UUID(list_row["id"]),
            UUID(item_id),
            quantity_received=Decimal("5"),
            idempotency_key="receipt-key-1",
        )

    assert mock_ledger.await_count == 1
    assert mock_send_task.call_count == 1


@pytest.mark.asyncio
async def test_document_receipt_matching_updates_existing_plan_without_duplicate_ledger():
    tenant = _tenant()
    repo = _FakeShoppingRepo()
    list_row = await repo.create(
        tenant,
        {
            "organization_id": str(tenant.org_id),
            "name": "Reorder Plan",
            "status": "approved",
            "source_prediction_ids": [str(uuid4())],
            "generation_params": {"plan_kind": "forecast_reorder", "order_representation_state": "order_ready"},
        },
    )
    inventory_item_id = str(uuid4())
    item_id = str(uuid4())
    repo.items[list_row["id"]] = [
        {
            "id": item_id,
            "shopping_list_id": list_row["id"],
            "inventory_item_id": inventory_item_id,
            "prediction_id": str(uuid4()),
            "name": "Milk",
            "quantity": "5",
            "unit": "unit",
            "estimated_price": "3.5",
            "actual_price": None,
            "priority": "high",
            "reason": "Predicted stockout",
            "source": "prediction",
            "is_purchased": False,
            "receipt_idempotency_key": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
    ]

    with (
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
    ):
        lifecycle = ReorderLifecycleService()
        result = await lifecycle.match_document_receipt(
            tenant,
            document_id=uuid4(),
            matched_items=[
                {
                    "item_id": UUID(inventory_item_id),
                    "quantity": 5,
                    "actual_price": 4.2,
                }
            ],
        )

    assert result["matched_item_count"] == 1
    assert list_row["status"] == "received"
    assert repo.items[list_row["id"]][0]["actual_price"] == "4.2"
    assert repo.items[list_row["id"]][0]["is_purchased"] is True


@pytest.mark.asyncio
async def test_no_qualifying_risk_creates_no_empty_shopping_list():
    tenant = _tenant()
    repo = _FakeShoppingRepo()
    item_id = str(uuid4())
    prediction = _prediction_row(item_id=item_id, depletion_days=30, qty=2, risk="later")
    prediction["property_id"] = str(tenant.property_id)
    admin = _FakeAdminClient(
        inventory_items=[_inventory_row(tenant=tenant, item_id=item_id, name="Milk", quantity=20)],
        predictions=[prediction],
    )

    with (
        patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.reorder_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
    ):
        result = await ReorderService().create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})

    assert result["result_code"] == "NO_ELIGIBLE_ITEMS"
    assert len(repo.lists) == 0


@pytest.mark.asyncio
async def test_prediction_pending_and_isolation_and_shared_backend_logic():
    tenant = _tenant(role="resident")
    other_tenant = _tenant()
    repo = _FakeShoppingRepo()
    item_id = str(uuid4())
    other_item = str(uuid4())
    admin = _FakeAdminClient(
        inventory_items=[
            _inventory_row(tenant=tenant, item_id=item_id, name="Milk", quantity=2),
            _inventory_row(tenant=other_tenant, item_id=other_item, name="Eggs", quantity=1),
        ],
        predictions=[],
    )

    with (
        patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.reorder_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
    ):
        pending = await ReorderService().create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})

    assert pending["result_code"] == "PREDICTION_PENDING"
    assert pending["shopping_list_id"] is None

    prediction = _prediction_row(item_id=item_id, depletion_days=1, qty=6, risk="critical")
    prediction["property_id"] = str(tenant.property_id)
    admin.rows["predictions"] = [prediction]
    with (
        patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.reorder_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.get_shopping_lists_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.reorder_lifecycle_service.AuditService.log", new=AsyncMock(return_value=None)),
    ):
        created = await ReorderService().create_or_update_reorder_plan(tenant, trigger_context={"source": "test"})

    assert created["result_code"] == "CREATED"
    assert created["shopping_list"]["property_id"] == str(tenant.property_id)
