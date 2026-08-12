from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.services.forecast_eligibility_service import ForecastEligibilityResult
from app.services.operational_workflow_service import OperationalWorkflowService


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db: _FakeAdmin, table: str):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters: list[tuple[str, str, object]] = []
        self._single = False

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def eq(self, key: str, value: object):
        self.filters.append(("eq", key, value))
        return self

    def single(self):
        self._single = True
        return self

    async def execute(self):
        return self.db.execute(self)


class _FakeAdmin:
    def __init__(self, scan_id: str, *, processed_results: dict):
        self.scan_id = scan_id
        self.scans = {
            scan_id: {
                "id": scan_id,
                "status": "inventory_posted",
                "processed_results": processed_results,
            }
        }

    def table(self, name: str):
        return _Query(self, name)

    def execute(self, query: _Query):
        if query.table != "scans":
            return _Resp(None)
        if query.op == "select":
            row = self.scans[self.scan_id]
            return _Resp(row if query._single else [row])
        if query.op == "update":
            self.scans[self.scan_id] = {**self.scans[self.scan_id], **(query.payload or {})}
            return _Resp([self.scans[self.scan_id]])
        return _Resp(None)


def _tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )


def _scan_payload() -> dict:
    return {
        "items": [
            {"item_name": "Milk", "quantity": 2, "unit": "unit"},
            {"item_name": "Eggs", "quantity": 1, "unit": "box"},
        ],
        "receipt_metadata": {
            "vendor_name": "Acme Foods",
            "receipt_total": "42.50",
        },
        "stage_details": {
            "inventory": {"status": "completed", "elapsed_ms": 120},
            "downstream": {"status": "running"},
        },
        "stage_errors": [],
    }


@pytest.mark.asyncio
async def test_first_purchase_document_finishes_with_learning_state_and_next_action():
    tenant = _tenant()
    scan_id = str(uuid4())
    admin = _FakeAdmin(scan_id, processed_results=_scan_payload())
    forecast = ForecastEligibilityResult(
        status="blocked",
        reason_code="INSUFFICIENT_DOCUMENTS",
        evidence_cycles_available=1,
        evidence_cycles_required=3,
        last_forecast_at=None,
        next_eligible_at=None,
        detail="waiting_for_more_purchase_documents",
        cadence_hours=12,
    )
    service = OperationalWorkflowService()

    with (
        patch("app.services.operational_workflow_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.pattern_agent.recompute_patterns_for_property", new=AsyncMock(return_value={"patterns_recomputed": 1})),
        patch("app.services.predict_agent.recompute_predictions_for_property", new=AsyncMock(return_value={"predictions_upserted": 0})),
        patch.object(service._forecast_eligibility, "evaluate_forecast_eligibility", new=AsyncMock(return_value=forecast)),
        patch.object(service._reorder, "create_or_update_reorder_plan", new=AsyncMock(return_value={"result_code": "NO_ELIGIBLE_ITEMS"})),
        patch.object(service._alerts, "evaluate_inventory", new=AsyncMock(return_value=[])),
        patch.object(service._briefing, "get_briefing", new=AsyncMock(return_value={"log_count": 1})),
        patch("app.services.operational_workflow_service.log_business_event", new=MagicMock()),
    ):
        result = await service.run_post_scan_workflow(tenant, scan_id=scan_id)

    assert result["status"] == "completed"
    stage_details = admin.scans[scan_id]["processed_results"]["stage_details"]
    assert stage_details["forecast_eligibility"]["reason_code"] == "INSUFFICIENT_DOCUMENTS"
    assert stage_details["predictions"]["status"] == "skipped"
    assert stage_details["next_best_action"]["label"] == "See what Neumas found"
    assert stage_details["workflow_timing"]["ledger_to_forecast_eligibility_ms"] >= 0


@pytest.mark.asyncio
async def test_sufficient_history_creates_reorder_and_dashboard_action_automatically():
    tenant = _tenant()
    scan_id = str(uuid4())
    admin = _FakeAdmin(scan_id, processed_results=_scan_payload())
    forecast = ForecastEligibilityResult(
        status="eligible",
        reason_code="ELIGIBLE",
        evidence_cycles_available=4,
        evidence_cycles_required=3,
        last_forecast_at=None,
        next_eligible_at=None,
        detail="forecast_can_run",
        cadence_hours=12,
    )
    reorder_result = {
        "result_code": "CREATED",
        "shopping_list_id": str(uuid4()),
        "item_count": 2,
    }

    service = OperationalWorkflowService()
    with (
        patch("app.services.operational_workflow_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.pattern_agent.recompute_patterns_for_property", new=AsyncMock(return_value={"patterns_recomputed": 1})),
        patch("app.services.predict_agent.recompute_predictions_for_property", new=AsyncMock(return_value={"predictions_upserted": 2})),
        patch.object(service._forecast_eligibility, "evaluate_forecast_eligibility", new=AsyncMock(return_value=forecast)),
        patch.object(service._reorder, "create_or_update_reorder_plan", new=AsyncMock(return_value=reorder_result)),
        patch.object(service._alerts, "evaluate_inventory", new=AsyncMock(return_value=[{"id": "alert-1"}])),
        patch.object(service._briefing, "get_briefing", new=AsyncMock(return_value={"log_count": 2})),
        patch("app.services.operational_workflow_service.log_business_event", new=MagicMock()),
    ):
        result = await service.run_post_scan_workflow(tenant, scan_id=scan_id)

    assert result["status"] == "completed"
    stage_details = admin.scans[scan_id]["processed_results"]["stage_details"]
    assert stage_details["predictions"]["status"] == "completed"
    assert stage_details["reorder"]["result_code"] == "CREATED"
    assert stage_details["next_best_action"]["href"] == "/dashboard/shopping"
    assert stage_details["workflow_timing"]["forecast_to_recommendation_ms"] >= 0


@pytest.mark.asyncio
async def test_partial_failure_keeps_inventory_posted_and_records_retryable_stage_state():
    tenant = _tenant()
    scan_id = str(uuid4())
    admin = _FakeAdmin(scan_id, processed_results=_scan_payload())
    forecast = ForecastEligibilityResult(
        status="eligible",
        reason_code="ELIGIBLE",
        evidence_cycles_available=5,
        evidence_cycles_required=3,
        last_forecast_at=None,
        next_eligible_at=None,
        detail="forecast_can_run",
        cadence_hours=12,
    )

    service = OperationalWorkflowService()
    with (
        patch("app.services.operational_workflow_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.pattern_agent.recompute_patterns_for_property", new=AsyncMock(return_value={"patterns_recomputed": 1})),
        patch("app.services.predict_agent.recompute_predictions_for_property", new=AsyncMock(side_effect=RuntimeError("forecast boom"))),
        patch.object(service._forecast_eligibility, "evaluate_forecast_eligibility", new=AsyncMock(return_value=forecast)),
        patch.object(service._reorder, "create_or_update_reorder_plan", new=AsyncMock(side_effect=RuntimeError("shopping boom"))),
        patch.object(service._alerts, "evaluate_inventory", new=AsyncMock(return_value=[])),
        patch.object(service._briefing, "get_briefing", new=AsyncMock(return_value={"log_count": 0})),
        patch("app.services.operational_workflow_service.log_business_event", new=MagicMock()),
    ):
        result = await service.run_post_scan_workflow(tenant, scan_id=scan_id)

    assert result["status"] == "completed_with_partial_analysis"
    assert admin.scans[scan_id]["status"] == "completed_with_partial_analysis"
    stage_details = admin.scans[scan_id]["processed_results"]["stage_details"]
    stage_errors = admin.scans[scan_id]["processed_results"]["stage_errors"]
    assert stage_details["inventory"]["status"] == "completed"
    assert stage_details["predictions"]["status"] == "failed"
    assert stage_details["reorder"]["status"] == "failed"
    assert stage_details["downstream"]["status"] == "partial_failed"
    assert {row["stage"] for row in stage_errors} >= {"predictions", "reorder"}
