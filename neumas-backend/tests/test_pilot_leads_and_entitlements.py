from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext, get_tenant_context
from app.main import app
from app.schemas.entitlements import EntitlementFlags, EntitlementLimits, EntitlementResponse
from app.schemas.pilot_leads import PilotLeadCreateRequest
from app.services.entitlement_service import EntitlementService
from app.services.pilot_lead_service import PilotLeadService


@pytest.fixture
def admin_tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="admin",
        jwt="pilot-admin-jwt",
    )


@pytest.fixture
def override_tenant():
    def _install(tenant_ctx: TenantContext):
        async def _tenant_override() -> TenantContext:
            return tenant_ctx

        app.dependency_overrides[get_tenant_context] = _tenant_override

    yield _install
    app.dependency_overrides.clear()


def _pilot_lead_row(**overrides):
    base = {
        "id": str(uuid4()),
        "company_name": "Acme Kitchens",
        "contact_name": "Ava Lee",
        "email": "ava@acme.example.com",
        "phone": None,
        "business_type": "Restaurant",
        "outlet_count": "2-5",
        "current_workflow": "Manual spreadsheets",
        "preferred_start": None,
        "source": "pilot_page",
        "utm_source": "linkedin",
        "utm_medium": "social",
        "utm_campaign": "pilot_q3",
        "utm_content": None,
        "utm_term": None,
        "status": "NEW",
        "provisioned_org_id": None,
        "provisioned_property_id": None,
        "provisioned_user_id": None,
        "converted_at": None,
        "created_at": "2026-08-12T00:00:00+00:00",
        "updated_at": "2026-08-12T00:00:00+00:00",
    }
    base.update(overrides)
    return base


@pytest.mark.anyio
async def test_pilot_lead_submission_persists_new_record(monkeypatch):
    service = PilotLeadService()
    request = PilotLeadCreateRequest(
        company_name="Acme Kitchens",
        contact_name="Ava Lee",
        email="ava@acme.example.com",
        phone="+65 8123 4567",
        business_type="Restaurant",
        outlet_count="2-5",
        current_workflow="Manual spreadsheets",
        source="pilot_page",
        utm_source="linkedin",
    )

    inserted = _pilot_lead_row(phone="+65 8123 4567")
    insert_query = AsyncMock()
    insert_query.execute = AsyncMock(return_value=SimpleNamespace(data=[inserted]))

    select_query = AsyncMock()
    select_query.execute = AsyncMock(return_value=SimpleNamespace(data=[]))

    table = MagicMock()
    table.select.return_value.ilike.return_value.ilike.return_value.limit.return_value = select_query
    table.insert.return_value = insert_query

    client = MagicMock()
    client.table.return_value = table

    monkeypatch.setattr(
        "app.services.pilot_lead_service.get_async_supabase_admin",
        AsyncMock(return_value=client),
    )

    result = await service.submit(request)

    assert result.company_name == "Acme Kitchens"
    assert result.email == "ava@acme.example.com"
    assert table.insert.called


@pytest.mark.anyio
async def test_pilot_lead_submission_updates_duplicate(monkeypatch):
    service = PilotLeadService()
    request = PilotLeadCreateRequest(
        company_name="Acme Kitchens",
        contact_name="Ava Lee",
        email="ava@acme.example.com",
        phone=None,
        business_type="Restaurant",
        outlet_count="2-5",
        current_workflow="Paper-based",
        source="pilot_page",
    )

    existing = _pilot_lead_row(id=str(uuid4()))
    updated = _pilot_lead_row(id=existing["id"], current_workflow="Paper-based")

    select_query = AsyncMock()
    select_query.execute = AsyncMock(return_value=SimpleNamespace(data=[existing]))

    update_query = AsyncMock()
    update_query.execute = AsyncMock(return_value=SimpleNamespace(data=[updated]))

    table = MagicMock()
    table.select.return_value.ilike.return_value.ilike.return_value.limit.return_value = select_query
    table.update.return_value.eq.return_value = update_query

    client = MagicMock()
    client.table.return_value = table

    monkeypatch.setattr(
        "app.services.pilot_lead_service.get_async_supabase_admin",
        AsyncMock(return_value=client),
    )

    result = await service.submit(request)

    assert result.current_workflow == "Paper-based"
    assert table.update.called
    assert not table.insert.called


@pytest.mark.anyio
async def test_admin_pilot_leads_requires_admin(override_tenant):
    override_tenant(
        TenantContext(
            user_id=uuid4(),
            org_id=uuid4(),
            property_id=uuid4(),
            role="staff",
            jwt="staff-jwt",
        )
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/admin/pilot-leads",
            headers={"Authorization": "Bearer staff-jwt"},
        )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.anyio
async def test_admin_pilot_leads_conversion_does_not_duplicate_org(
    override_tenant,
    monkeypatch,
    admin_tenant: TenantContext,
):
    override_tenant(admin_tenant)
    lead_id = str(uuid4())
    fake_service = AsyncMock()
    fake_service.convert = AsyncMock(
        return_value={
            "lead_id": lead_id,
            "status": "CONVERTED",
            "organization_id": str(uuid4()),
            "property_id": str(uuid4()),
            "user_id": str(uuid4()),
        }
    )
    monkeypatch.setattr("app.api.routes.admin._pilot_lead_service", fake_service)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/admin/pilot-leads/{lead_id}/convert",
            headers={"Authorization": f"Bearer {admin_tenant.jwt}"},
            json={},
        )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["status"] == "CONVERTED"
    fake_service.convert.assert_awaited_once()


@pytest.mark.anyio
async def test_public_pilot_intake_route_persists(monkeypatch):
    fake_service = AsyncMock()
    fake_service.submit = AsyncMock(
        return_value=_pilot_lead_row()
    )
    monkeypatch.setattr("app.api.routes.public.pilot_lead_service", fake_service)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/public/pilot-intake",
            json={
                "company_name": "Acme Kitchens",
                "contact_name": "Ava Lee",
                "email": "ava@acme.example.com",
                "business_type": "Restaurant",
                "outlet_count": "2-5",
                "current_workflow": "Manual spreadsheets",
                "source": "pilot_page",
            },
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["company_name"] == "Acme Kitchens"
    fake_service.submit.assert_awaited_once()


@pytest.mark.anyio
async def test_public_pilot_intake_validation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/public/pilot-intake",
            json={"company_name": "X"},
        )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.anyio
async def test_entitlement_blocks_monthly_scans(monkeypatch, admin_tenant: TenantContext):
    service = EntitlementService()
    entitlements = EntitlementResponse(
        plan_code="HOME_FREE",
        limits=EntitlementLimits(monthly_scans=1, users=2, properties=1, history_days=90, forecast_frequency_hours=24),
        features=EntitlementFlags(),
    )
    monkeypatch.setattr(service, "get_for_tenant", AsyncMock(return_value=entitlements))

    query = AsyncMock()
    query.execute = AsyncMock(return_value=SimpleNamespace(count=1, data=[]))
    table = MagicMock()
    table.select.return_value.eq.return_value.gte.return_value = query
    client = MagicMock()
    client.table.return_value = table

    monkeypatch.setattr(
        "app.services.entitlement_service.get_async_supabase_admin",
        AsyncMock(return_value=client),
    )

    with pytest.raises(Exception) as exc_info:
        await service.enforce_monthly_scans(admin_tenant)

    assert "Monthly scan limit reached" in str(exc_info.value)


@pytest.mark.anyio
async def test_entitlement_blocks_forecast_frequency(monkeypatch, admin_tenant: TenantContext):
    service = EntitlementService()
    entitlements = EntitlementResponse(
        plan_code="FNB_STARTER",
        limits=EntitlementLimits(monthly_scans=500, users=5, properties=3, history_days=365, forecast_frequency_hours=12),
        features=EntitlementFlags(reports=True, exports=True),
    )
    monkeypatch.setattr(service, "get_for_tenant", AsyncMock(return_value=entitlements))

    query = AsyncMock()
    query.execute = AsyncMock(return_value=SimpleNamespace(data=[{"id": str(uuid4())}]))
    table = MagicMock()
    table.select.return_value.eq.return_value.eq.return_value.gte.return_value.limit.return_value = query
    client = MagicMock()
    client.table.return_value = table

    monkeypatch.setattr(
        "app.services.entitlement_service.get_async_supabase_admin",
        AsyncMock(return_value=client),
    )

    with pytest.raises(Exception) as exc_info:
        await service.enforce_forecast_frequency(admin_tenant, admin_tenant.property_id)

    assert "once every 12 hours" in str(exc_info.value)


@pytest.mark.anyio
async def test_entitlement_feature_gate_reports(monkeypatch, admin_tenant: TenantContext):
    service = EntitlementService()
    entitlements = EntitlementResponse(
        plan_code="HOME_FREE",
        limits=EntitlementLimits(monthly_scans=60, users=2, properties=1, history_days=90, forecast_frequency_hours=24),
        features=EntitlementFlags(reports=False),
    )
    monkeypatch.setattr(service, "get_for_tenant", AsyncMock(return_value=entitlements))

    with pytest.raises(Exception) as exc_info:
        await service.require_feature(
            admin_tenant,
            "reports",
            "Your current plan does not include report generation.",
        )

    assert "does not include report generation" in str(exc_info.value)
