from __future__ import annotations

from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.data_readiness import DataReadinessItem, DataReadinessResponse
from app.services.organization_onboarding_service import OrganizationOnboardingService


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client: _Client):
        self.client = client
        self.filters: list[tuple[str, str]] = []
        self.payload: dict | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key: str, value: str):
        self.filters.append((key, value))
        return self

    def limit(self, *_args):
        return self

    def upsert(self, payload: dict, **_kwargs):
        self.payload = payload
        return self

    async def execute(self):
        if self.payload is not None:
            self.client.upserts.append(self.payload)
            self.client.current = self.payload
            return _Resp([self.payload])
        if not self.client.current:
            return _Resp([])
        rows = [self.client.current]
        for key, value in self.filters:
            rows = [row for row in rows if row.get(key) == value]
        return _Resp(rows)


class _Client:
    def __init__(self, current: dict | None = None):
        self.current = current
        self.upserts: list[dict] = []

    def table(self, name: str):
        assert name == "organization_onboarding"
        return _Query(self)


def _item(status: str, count: int = 0) -> DataReadinessItem:
    return DataReadinessItem(
        status=status,
        record_count=count,
        last_updated=None,
        required_action="No action required" if status == "READY" else "missing",
    )


def _readiness(**overrides) -> DataReadinessResponse:
    payload = {
        "organization_id": str(uuid4()),
        "property_id": str(uuid4()),
        "overall_readiness": "PARTIAL",
        "readiness_tier": "TIER_2",
        "capability_readiness": {
            "inventory": "READY",
            "demand": "READY",
            "procurement": "MISSING",
            "margin": "MISSING",
        },
        "sales_data": _item("READY", 10),
        "inventory_data": _item("READY", 5),
        "supplier_data": _item("MISSING"),
        "recipe_data": _item("MISSING"),
        "invoice_data": _item("MISSING"),
        "purchase_order_data": _item("MISSING"),
        "demand_history": _item("READY", 10),
        "forecast_ready": _item("PARTIAL"),
        "procurement_ready": _item("MISSING"),
        "margin_ready": _item("MISSING"),
        "blockers": ["supplier_data: Add suppliers and supplier pricing"],
    }
    payload.update(overrides)
    return DataReadinessResponse(**payload)


@pytest.mark.asyncio
async def test_onboarding_snapshot_does_not_downgrade_stage():
    org_id = str(uuid4())
    client = _Client(
        {
            "organization_id": org_id,
            "stage": "DATA_CONNECTED",
            "completed_steps": ["ACCOUNT_CREATED", "ORGANIZATION_CREATED", "LOCATION_CREATED", "DATA_CONNECTED"],
            "operating_profile": {"business_type": "Restaurant"},
        }
    )

    await OrganizationOnboardingService().upsert_snapshot(
        organization_id=org_id,
        property_id=uuid4(),
        stage="LOCATION_CREATED",
        completed_steps=["ACCOUNT_CREATED", "ORGANIZATION_CREATED", "LOCATION_CREATED"],
        missing_requirements=["Complete baseline processing"],
        client=client,
    )

    assert client.upserts[0]["stage"] == "DATA_CONNECTED"
    assert "DATA_CONNECTED" in client.upserts[0]["completed_steps"]
    assert client.upserts[0]["operating_profile"] == {"business_type": "Restaurant"}


@pytest.mark.asyncio
async def test_onboarding_sync_derives_stage_from_readiness():
    org_id = uuid4()
    property_id = uuid4()
    client = _Client(
        {
            "organization_id": str(org_id),
            "property_id": str(property_id),
            "stage": "OPERATING_PROFILE_SET",
            "completed_steps": ["ACCOUNT_CREATED", "ORGANIZATION_CREATED", "LOCATION_CREATED", "OPERATING_PROFILE_SET"],
            "operating_profile": {"business_type": "Restaurant", "data_start_choice": "csv"},
        }
    )
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=org_id,
        property_id=property_id,
        role="admin",
        jwt="token",
    )

    await OrganizationOnboardingService().sync_from_readiness(
        tenant,
        _readiness(),
        client=client,
    )

    assert client.upserts[0]["stage"] == "BASELINE_PROCESSING"
    assert client.upserts[0]["missing_requirements"] == ["supplier_data: Add suppliers and supplier pricing"]
    assert "BASELINE_PROCESSING" in client.upserts[0]["completed_steps"]
