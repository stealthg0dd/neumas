from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.api import deps
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


class _MutableQuery:
    def __init__(self, admin: _MutableAdmin, table_name: str):
        self.admin = admin
        self.table_name = table_name
        self.filters: list[tuple[str, object]] = []
        self.update_payload: dict | None = None

    def select(self, *_args, **_kwargs):
        return self

    def update(self, payload: dict):
        self.update_payload = payload
        return self

    def eq(self, key: str, value: object):
        self.filters.append((key, value))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    async def execute(self):
        if self.table_name == "users":
            if self.update_payload is not None:
                self.admin.user_updates.append(
                    {
                        "payload": self.update_payload,
                        "filters": list(self.filters),
                    }
                )
            return _Resp([])

        if self.table_name != "properties":
            raise AssertionError(f"unexpected table {self.table_name}")

        rows = self.admin.properties
        for key, value in self.filters:
            rows = [row for row in rows if row.get(key) == value]
        return _Resp(rows)


class _MutableAdmin:
    def __init__(self, properties: list[dict]):
        self.properties = properties
        self.user_updates: list[dict] = []

    def table(self, name: str):
        return _MutableQuery(self, name)


def _tenant_user(
    *,
    org_id,
    default_property_id=None,
) -> UserInfo:
    return UserInfo(
        id=uuid4(),
        auth_id=uuid4(),
        email="operator@example.com",
        role="staff",
        organization_id=org_id,
        default_property_id=default_property_id,
        permissions={},
        is_active=True,
    )


async def _resolve_context(monkeypatch, user: UserInfo, admin: _MutableAdmin) -> TenantContext:
    monkeypatch.setattr(deps, "get_async_supabase_admin", AsyncMock(return_value=admin))
    return await deps.get_tenant_context("jwt-token", user)


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
async def test_tenant_context_keeps_valid_default_property_without_backfill(monkeypatch):
    org_id = uuid4()
    property_id = uuid4()
    user = _tenant_user(org_id=org_id, default_property_id=property_id)
    admin = _MutableAdmin(
        [
            {
                "id": str(property_id),
                "organization_id": str(org_id),
                "is_active": True,
            }
        ]
    )

    tenant = await _resolve_context(monkeypatch, user, admin)

    assert tenant.property_id == property_id
    assert admin.user_updates == []


@pytest.mark.asyncio
async def test_tenant_context_backfills_missing_default_property(monkeypatch):
    org_id = uuid4()
    property_id = uuid4()
    user = _tenant_user(org_id=org_id)
    admin = _MutableAdmin(
        [
            {
                "id": str(property_id),
                "organization_id": str(org_id),
                "is_active": True,
                "is_primary": True,
                "onboarding_order": 0,
                "created_at": "2026-09-27T00:00:00+00:00",
            }
        ]
    )

    tenant = await _resolve_context(monkeypatch, user, admin)

    assert tenant.property_id == property_id
    assert admin.user_updates == [
        {
            "payload": {"default_property_id": str(property_id)},
            "filters": [("id", str(user.id))],
        }
    ]


@pytest.mark.asyncio
async def test_tenant_context_replaces_deleted_or_inactive_default_property(monkeypatch):
    org_id = uuid4()
    inactive_property_id = uuid4()
    active_property_id = uuid4()
    user = _tenant_user(org_id=org_id, default_property_id=inactive_property_id)
    admin = _MutableAdmin(
        [
            {
                "id": str(inactive_property_id),
                "organization_id": str(org_id),
                "is_active": False,
            },
            {
                "id": str(active_property_id),
                "organization_id": str(org_id),
                "is_active": True,
                "is_primary": True,
                "onboarding_order": 0,
                "created_at": "2026-09-27T00:00:00+00:00",
            },
        ]
    )

    tenant = await _resolve_context(monkeypatch, user, admin)

    assert tenant.property_id == active_property_id
    assert admin.user_updates[0]["payload"] == {"default_property_id": str(active_property_id)}


@pytest.mark.asyncio
async def test_tenant_context_returns_no_property_when_org_has_no_properties(monkeypatch):
    org_id = uuid4()
    user = _tenant_user(org_id=org_id)
    admin = _MutableAdmin([])

    tenant = await _resolve_context(monkeypatch, user, admin)

    assert tenant.property_id is None
    assert admin.user_updates == []


@pytest.mark.asyncio
async def test_tenant_context_never_uses_cross_org_default_property(monkeypatch):
    user_org_id = uuid4()
    other_org_id = uuid4()
    cross_org_property_id = uuid4()
    valid_property_id = uuid4()
    user = _tenant_user(org_id=user_org_id, default_property_id=cross_org_property_id)
    admin = _MutableAdmin(
        [
            {
                "id": str(cross_org_property_id),
                "organization_id": str(other_org_id),
                "is_active": True,
            },
            {
                "id": str(valid_property_id),
                "organization_id": str(user_org_id),
                "is_active": True,
                "is_primary": True,
                "onboarding_order": 0,
                "created_at": "2026-09-27T00:00:00+00:00",
            },
        ]
    )

    tenant = await _resolve_context(monkeypatch, user, admin)

    assert tenant.property_id == valid_property_id
    assert tenant.property_id != cross_org_property_id
    assert admin.user_updates[0]["payload"] == {"default_property_id": str(valid_property_id)}


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
