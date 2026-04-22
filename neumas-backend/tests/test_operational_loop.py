from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.api.deps import TenantContext


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
async def test_predictions_route_normalizes_recommendation_fields(tenant: TenantContext):
    from app.api.routes.predictions import list_predictions

    prediction_date = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    repo = AsyncMock()
    repo.get_by_property.return_value = [
        {
            "id": str(uuid4()),
            "item_id": str(uuid4()),
            "prediction_type": "stockout",
            "prediction_date": prediction_date,
            "confidence": 0.91,
            "stockout_risk_level": "critical",
            "inventory_item": {"id": str(uuid4()), "name": "Milk"},
        }
    ]

    with patch("app.api.routes.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)):
        rows = await list_predictions(tenant=tenant, urgency=None, limit=10)

    assert rows[0]["item_name"] == "Milk"
    assert rows[0]["recommended_action"] == "Add to shopping list"
    assert rows[0]["days_until_runout"] is not None


@pytest.mark.asyncio
async def test_scan_service_rerun_with_hint_returns_queue_status(tenant: TenantContext):
    from app.services.scan_service import ScanService

    svc = ScanService()
    scan_id = uuid4()

    with (
        patch("app.services.scan_service.get_scans_repository", new=AsyncMock()) as repo_factory,
        patch("app.services.scan_service.asyncio.create_task") as create_task,
    ):
        repo = AsyncMock()
        repo.get_by_id.return_value = {"id": str(scan_id)}
        repo_factory.return_value = repo
        create_task.side_effect = lambda coro: (coro.close(), AsyncMock())[1]
        response = await svc.rerun_with_hint(scan_id, tenant, "Treat sprite as 24 cans")

    assert response["scan_id"] == str(scan_id)
    assert response["status"] == "queued"
    assert response["hint"] == "Treat sprite as 24 cans"
    create_task.assert_called_once()
