from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.api.deps import (
    TenantContext,
    UserInfo,
    get_tenant_context,
    resolve_active_property_id,
)
from app.main import app


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.filters: list[tuple[str, object]] = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key: str, value: object):
        self.filters.append((key, value))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    async def execute(self):
        rows = self.rows
        for key, value in self.filters:
            rows = [row for row in rows if row.get(key) == value]
        return _Resp(rows)


class _FakeAdmin:
    def __init__(self, properties: list[dict]):
        self.properties = properties

    def table(self, name: str):
        if name == "properties":
            return _Query(self.properties)
        raise AssertionError(f"unexpected table {name}")


@pytest.mark.asyncio
async def test_resolve_active_property_prefers_primary_active_property_when_default_is_invalid():
    org_id = uuid4()
    user = UserInfo(
        id=uuid4(),
        auth_id=uuid4(),
        email="operator@example.com",
        role="staff",
        organization_id=org_id,
        default_property_id=uuid4(),
        permissions={},
        is_active=True,
    )
    primary_property_id = uuid4()
    admin = _FakeAdmin(
        [
            {
                "id": str(primary_property_id),
                "organization_id": str(org_id),
                "is_active": True,
                "is_primary": True,
                "onboarding_order": 0,
                "created_at": "2026-08-12T00:00:00+00:00",
            },
            {
                "id": str(uuid4()),
                "organization_id": str(org_id),
                "is_active": True,
                "is_primary": False,
                "onboarding_order": 1,
                "created_at": "2026-08-12T00:01:00+00:00",
            },
        ]
    )

    resolved = await resolve_active_property_id(user, admin)

    assert resolved == primary_property_id


@pytest.mark.asyncio
async def test_generate_shopping_list_returns_canonical_pending_outcome():
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )

    async def _tenant_override():
        return tenant

    app.dependency_overrides[get_tenant_context] = _tenant_override
    try:
        with patch(
            "app.api.routes.shopping.shopping_service.generate_list",
            new=AsyncMock(
                return_value={
                    "job_id": "job-1",
                    "message": "prediction_pending",
                    "property_id": tenant.property_id,
                    "result_code": "PREDICTION_PENDING",
                    "shopping_list_id": None,
                    "item_count": 0,
                    "detail": "no_stockout_predictions",
                }
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/api/shopping-list/generate",
                    json={"include_critical_only": False, "min_days_threshold": 7},
                    headers={"Authorization": "Bearer test-token"},
                )
    finally:
        app.dependency_overrides.pop(get_tenant_context, None)

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["result_code"] == "PREDICTION_PENDING"
    assert body["property_id"] == str(tenant.property_id)


@pytest.mark.asyncio
async def test_generate_shopping_list_returns_error_payload_for_non_worker_failure():
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )

    async def _tenant_override():
        return tenant

    app.dependency_overrides[get_tenant_context] = _tenant_override
    try:
        with patch(
            "app.api.routes.shopping.shopping_service.generate_list",
            new=AsyncMock(side_effect=RuntimeError("unexpected planner failure")),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/api/shopping-list/generate",
                    json={"include_critical_only": False, "min_days_threshold": 7},
                    headers={"Authorization": "Bearer test-token"},
                )
    finally:
        app.dependency_overrides.pop(get_tenant_context, None)

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["result_code"] == "ERROR"
    assert body["message"] == "generation_failed"
    assert body["property_id"] == str(tenant.property_id)
