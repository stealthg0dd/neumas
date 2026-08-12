from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext, get_tenant_context
from app.main import app
from app.services.impact_service import ImpactService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="admin",
        jwt="impact-jwt",
    )


@pytest.fixture
def override_tenant():
    def _install(tenant_ctx: TenantContext):
        async def _tenant_override() -> TenantContext:
            return tenant_ctx

        app.dependency_overrides[get_tenant_context] = _tenant_override

    yield _install
    app.dependency_overrides.clear()


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    async def execute(self):
        return SimpleNamespace(data=self.rows)


class _FakeClient:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name: str):
        return _Query(self.tables.get(name, []))


@pytest.mark.asyncio
async def test_impact_service_is_reproducible_and_scoped(tenant: TenantContext):
    client = _FakeClient(
        {
            "documents": [{"id": str(uuid4()), "status": "approved", "review_needed": False}],
            "document_line_items": [
                {"id": str(uuid4()), "review_needed": False, "corrected_at": None, "inventory_movement_id": str(uuid4())},
                {"id": str(uuid4()), "review_needed": True, "corrected_at": None, "inventory_movement_id": str(uuid4())},
            ],
            "shopping_list_transitions": [{"id": str(uuid4()), "next_state": "recommended", "previous_state": "draft", "reason": "forecast_risk_detected"}],
            "shopping_lists": [{"id": str(uuid4()), "status": "received", "total_estimated_cost": 12, "total_actual_cost": 11}],
            "prediction_evaluations": [{"id": str(uuid4()), "quantity_error": 0.2, "recommendation_accepted": True, "operator_overridden": False}],
            "item_price_history": [
                {"id": str(uuid4()), "vendor_id": str(uuid4()), "item_id": str(uuid4()), "price": 3, "purchase_date": "2026-08-01T00:00:00+00:00"},
                {"id": str(uuid4()), "vendor_id": str(uuid4()), "item_id": str(uuid4()), "price": 4, "purchase_date": "2026-08-02T00:00:00+00:00"},
            ],
            "inventory_movements": [{"id": str(uuid4()), "movement_type": "purchase", "reference_type": "document", "reference_id": str(uuid4())}],
        }
    )
    with patch("app.services.impact_service.get_async_supabase_admin", new=AsyncMock(return_value=client)):
        service = ImpactService()
        first = await service.get_impact_summary(tenant, workspace_experience="FNB")
        second = await service.get_impact_summary(tenant, workspace_experience="FNB")

    assert first["mode"] == "measured"
    assert second["summary"]["documents_processed"] == first["summary"]["documents_processed"]
    assert first["summary"]["recommendation_acceptance_rate"] == 1.0
    assert first["summary"]["manual_review_rate"] == 0.5


@pytest.mark.anyio
async def test_operator_copilot_route_returns_grounded_citations(override_tenant, tenant: TenantContext, monkeypatch):
    override_tenant(tenant)
    fake_service = AsyncMock()
    fake_service.answer = AsyncMock(
        return_value={
            "answer": "Two actions need attention today.",
            "citations": [{"kind": "decision", "id": "review_required", "label": "Review invoice", "href": "/dashboard/documents"}],
            "mode": "fallback",
        }
    )
    monkeypatch.setattr("app.api.routes.insights.operator_copilot_service", fake_service)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/insights/operator-copilot",
            headers={"Authorization": f"Bearer {tenant.jwt}"},
            json={"question": "What needs my attention today?"},
        )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["answer"] == "Two actions need attention today."
    assert body["citations"][0]["href"] == "/dashboard/documents"
