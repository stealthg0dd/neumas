from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.services.forecast_eligibility_service import ForecastEligibilityService


class _Resp:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, db, table: str):
        self.db = db
        self.table = table
        self.filters: list[tuple[str, str, object]] = []
        self._limit: int | None = None
        self._order_key: str | None = None

    def select(self, *_args, count=None, **_kwargs):
        self._count = count
        return self

    def eq(self, key, value):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key, values):
        self.filters.append(("in", key, list(values)))
        return self

    def order(self, key, *_args, **_kwargs):
        self._order_key = key
        return self

    def limit(self, value):
        self._limit = value
        return self

    async def execute(self):
        rows = [dict(row) for row in self.db.rows.get(self.table, []) if self._matches(row)]
        if self._order_key:
            rows.sort(key=lambda row: str(row.get(self._order_key) or ""), reverse=True)
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Resp(rows, count=len(rows))

    def _matches(self, row: dict) -> bool:
        for operator, key, value in self.filters:
            row_value = row.get(key)
            if operator == "eq" and row_value != value:
                return False
            if operator == "in" and row_value not in value:
                return False
        return True


class _FakeAdmin:
    def __init__(self, rows: dict[str, list[dict]]):
        self.rows = rows

    def table(self, name: str):
        return _Query(self, name)


@pytest.mark.asyncio
async def test_forecast_eligibility_requires_minimum_documents():
    org_id = uuid4()
    property_id = uuid4()
    admin = _FakeAdmin(
        {
            "scans": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "status": "completed", "created_at": datetime.now(UTC).isoformat()},
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "status": "completed", "created_at": datetime.now(UTC).isoformat()},
            ]
        }
    )
    entitlements = AsyncMock(return_value=type("Ent", (), {"limits": type("Lim", (), {"forecast_frequency_hours": 12})()})())

    with (
        patch("app.services.forecast_eligibility_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.forecast_eligibility_service.EntitlementService.get_for_tenant", new=entitlements),
    ):
        result = await ForecastEligibilityService().evaluate_forecast_eligibility(org_id, property_id)

    assert result.reason_code == "INSUFFICIENT_DOCUMENTS"
    assert result.evidence_cycles_available == 2


@pytest.mark.asyncio
async def test_forecast_eligibility_honors_cadence_when_recent_prediction_exists():
    org_id = uuid4()
    property_id = uuid4()
    now = datetime.now(UTC)
    admin = _FakeAdmin(
        {
            "scans": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "status": "completed", "created_at": now.isoformat()},
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "status": "completed", "created_at": now.isoformat()},
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "status": "completed", "created_at": now.isoformat()},
            ],
            "inventory_movements": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id)},
            ],
            "consumption_patterns": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "pattern_type": "daily", "sample_size": 3},
            ],
            "inventory_items": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "canonical_item_id": str(uuid4()), "is_active": True},
            ],
            "predictions": [
                {
                    "id": str(uuid4()),
                    "organization_id": str(org_id),
                    "property_id": str(property_id),
                    "prediction_type": "stockout",
                    "generated_at": (now - timedelta(hours=2)).isoformat(),
                    "created_at": (now - timedelta(hours=2)).isoformat(),
                }
            ],
        }
    )
    entitlements = AsyncMock(return_value=type("Ent", (), {"limits": type("Lim", (), {"forecast_frequency_hours": 12})()})())

    with (
        patch("app.services.forecast_eligibility_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.forecast_eligibility_service.EntitlementService.get_for_tenant", new=entitlements),
    ):
        result = await ForecastEligibilityService().evaluate_forecast_eligibility(org_id, property_id)

    assert result.reason_code == "ALREADY_FRESH"
    assert result.next_eligible_at is not None


@pytest.mark.asyncio
async def test_forecast_eligibility_returns_eligible_when_evidence_mature_and_stale():
    org_id = uuid4()
    property_id = uuid4()
    now = datetime.now(UTC)
    admin = _FakeAdmin(
        {
            "scans": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "status": "completed", "created_at": now.isoformat()},
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "status": "completed", "created_at": now.isoformat()},
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "status": "completed", "created_at": now.isoformat()},
            ],
            "inventory_movements": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id)},
            ],
            "consumption_patterns": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "pattern_type": "daily", "sample_size": 3},
            ],
            "inventory_items": [
                {"id": str(uuid4()), "organization_id": str(org_id), "property_id": str(property_id), "canonical_item_id": str(uuid4()), "is_active": True},
            ],
            "predictions": [
                {
                    "id": str(uuid4()),
                    "organization_id": str(org_id),
                    "property_id": str(property_id),
                    "prediction_type": "stockout",
                    "generated_at": (now - timedelta(hours=14)).isoformat(),
                    "created_at": (now - timedelta(hours=14)).isoformat(),
                }
            ],
        }
    )
    entitlements = AsyncMock(return_value=type("Ent", (), {"limits": type("Lim", (), {"forecast_frequency_hours": 12})()})())

    with (
        patch("app.services.forecast_eligibility_service.get_async_supabase_admin", new=AsyncMock(return_value=admin)),
        patch("app.services.forecast_eligibility_service.EntitlementService.get_for_tenant", new=entitlements),
    ):
        result = await ForecastEligibilityService().evaluate_forecast_eligibility(org_id, property_id)

    assert result.reason_code == "ELIGIBLE"
