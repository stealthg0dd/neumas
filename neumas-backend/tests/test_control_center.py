from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext, get_tenant_context
from app.main import app
from app.schemas.control_center import ControlCenterSummary
from app.services.control_center_service import ControlCenterService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="admin",
        jwt="test-token",
    )


def _summary(tenant: TenantContext) -> ControlCenterSummary:
    return ControlCenterSummary(
        generated_at=datetime.now(UTC),
        organization_id=str(tenant.org_id),
        property_id=str(tenant.property_id),
        kpis=[],
        risks=[],
        recommendations=[],
        open_approvals=[],
        exceptions=[],
        demand_summary={"stock_risk_count": 0, "history_days_observed": 0, "evidence": []},
        margin_summary={"evidence": []},
        supplier_summary={"supplier_count": 0, "price_alert_count": 0, "evidence": []},
        recent_actions=[],
    )


@pytest.mark.anyio
async def test_control_center_summary_endpoint_uses_aggregator(monkeypatch, tenant: TenantContext):
    async def _tenant_override() -> TenantContext:
        return tenant

    app.dependency_overrides[get_tenant_context] = _tenant_override
    monkeypatch.setattr(
        "app.api.routes.control_center.control_center_service.build_summary",
        AsyncMock(return_value=_summary(tenant)),
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/control-center/summary")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["organization_id"] == str(tenant.org_id)
    assert payload["property_id"] == str(tenant.property_id)


@pytest.mark.asyncio
async def test_control_center_queries_are_tenant_isolated(monkeypatch, tenant: TenantContext):
    filters: dict[str, list[tuple[str, str]]] = {}

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Query:
        def __init__(self, table: str):
            self.table = table
            filters.setdefault(table, [])

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, key, value):
            filters[self.table].append((key, value))
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        async def execute(self):
            return _Resp([])

    class _Client:
        def table(self, table: str):
            return _Query(table)

    service = ControlCenterService()
    monkeypatch.setattr(
        "app.services.control_center_service.get_async_supabase_admin",
        AsyncMock(return_value=_Client()),
    )
    monkeypatch.setattr(
        service._decision_center,
        "build",
        AsyncMock(return_value=SimpleNamespace(ahead=SimpleNamespace(), impact=SimpleNamespace())),
    )

    payload = await service.build_summary(tenant)

    assert payload.organization_id == str(tenant.org_id)
    assert payload.property_id == str(tenant.property_id)
    for table, applied in filters.items():
        assert ("organization_id", str(tenant.org_id)) in applied, table
        assert ("property_id", str(tenant.property_id)) in applied, table


@pytest.mark.asyncio
async def test_control_center_does_not_fabricate_missing_po_or_supplier_metrics(monkeypatch, tenant: TenantContext):
    class _Resp:
        data: list[dict] = []

    class _Query:
        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        async def execute(self):
            return _Resp()

    class _Client:
        def table(self, _table: str):
            return _Query()

    service = ControlCenterService()
    monkeypatch.setattr(
        "app.services.control_center_service.get_async_supabase_admin",
        AsyncMock(return_value=_Client()),
    )
    monkeypatch.setattr(
        service._decision_center,
        "build",
        AsyncMock(return_value=SimpleNamespace(ahead=SimpleNamespace(), impact=SimpleNamespace())),
    )

    payload = await service.build_summary(tenant)

    by_key = {kpi.key: kpi for kpi in payload.kpis}
    assert by_key["pos_awaiting_action"].value is None
    assert by_key["supplier_otif"].value is None
    assert payload.margin_summary.food_cost_pct is None
    assert payload.recommendations == []
