"""Tests for the admin consumption-pattern/prediction backfill endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext, get_tenant_context
from app.main import app


def _mock_supabase(property_ids: list[str], scan_property_ids: list[str]) -> MagicMock:
    client = MagicMock()

    properties_query = AsyncMock()
    properties_query.execute = AsyncMock(
        return_value=MagicMock(data=[{"id": pid} for pid in property_ids])
    )

    scans_query = AsyncMock()
    scans_query.execute = AsyncMock(
        return_value=MagicMock(data=[{"property_id": pid} for pid in scan_property_ids])
    )

    def table(name: str):
        if name == "properties":
            mock_table = MagicMock()
            mock_table.select.return_value.eq.return_value = properties_query
            return mock_table
        if name == "scans":
            mock_table = MagicMock()
            mock_table.select.return_value.in_.return_value.in_.return_value = scans_query
            return mock_table
        raise AssertionError(f"Unexpected table: {name}")

    client.table.side_effect = table
    return client


@pytest.fixture
def override_tenant():
    """Yields a function to install a TenantContext dependency override."""
    def _install(tenant: TenantContext):
        async def _tenant_override() -> TenantContext:
            return tenant

        app.dependency_overrides[get_tenant_context] = _tenant_override

    yield _install
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_backfill_patterns_requires_admin(override_tenant):
    override_tenant(
        TenantContext(
            user_id=uuid4(),
            org_id=uuid4(),
            property_id=uuid4(),
            role="staff",
            jwt="mock-jwt",
        )
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/admin/backfill-patterns",
            headers={"Authorization": "Bearer mock-jwt"},
        )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.anyio
async def test_backfill_patterns_recomputes_for_properties_with_completed_scans(override_tenant):
    org_id = uuid4()
    property_id = str(uuid4())

    override_tenant(
        TenantContext(
            user_id=uuid4(),
            org_id=org_id,
            property_id=uuid4(),
            role="admin",
            jwt="mock-jwt",
        )
    )

    fake_supabase = _mock_supabase(
        property_ids=[property_id],
        scan_property_ids=[property_id],
    )

    recompute_patterns = AsyncMock(return_value={"items_analyzed": 3, "patterns_found": 3})
    recompute_predictions = AsyncMock(return_value={"predictions_upserted": 3})

    with (
        patch("app.api.routes.admin.get_async_supabase_admin", new=AsyncMock(return_value=fake_supabase)),
        patch("app.services.pattern_agent.recompute_patterns_for_property", recompute_patterns),
        patch("app.services.predict_agent.recompute_predictions_for_property", recompute_predictions),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/admin/backfill-patterns",
                headers={"Authorization": "Bearer mock-jwt"},
            )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["triggered"] == 1
    assert body["errors"] == []
    assert body["results"][0]["property_id"] == property_id
    assert body["results"][0]["patterns"]["patterns_found"] == 3
    assert body["results"][0]["predictions"]["predictions_upserted"] == 3

    recompute_patterns.assert_awaited_once_with(UUID(property_id), org_id=str(org_id))
    recompute_predictions.assert_awaited_once_with(UUID(property_id))


@pytest.mark.anyio
async def test_backfill_patterns_no_properties_returns_zero(override_tenant):
    org_id = uuid4()

    override_tenant(
        TenantContext(
            user_id=uuid4(),
            org_id=org_id,
            property_id=uuid4(),
            role="admin",
            jwt="mock-jwt",
        )
    )

    fake_supabase = _mock_supabase(property_ids=[], scan_property_ids=[])

    with patch("app.api.routes.admin.get_async_supabase_admin", new=AsyncMock(return_value=fake_supabase)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/admin/backfill-patterns",
                headers={"Authorization": "Bearer mock-jwt"},
            )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body == {"triggered": 0, "results": [], "errors": []}
