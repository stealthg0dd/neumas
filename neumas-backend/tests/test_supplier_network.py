"""Supplier network service — org isolation and onboarding happy path."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.supplier_network import (
    SupplierAccountCreate,
    SupplierCatalogImportRequest,
    SupplierCommercialTermsUpsert,
    SupplierServiceAreaCreate,
)
from app.services.supplier_network_service import SupplierNetworkService


class FakeQuery:
    def __init__(self, db: FakeSupabase, table: str) -> None:
        self.db = db
        self.table_name = table
        self.filters: list[tuple[str, object]] = []
        self.payload: dict | None = None
        self.operation = "select"
        self.row_limit: int | None = None
        self.ordering: tuple[str, bool] | None = None
        self.on_conflict: str | None = None

    def select(self, _selection: str = "*") -> FakeQuery:
        self.operation = "select"
        return self

    def eq(self, field: str, value: object) -> FakeQuery:
        self.filters.append((field, value))
        return self

    def in_(self, field: str, values: list) -> FakeQuery:
        self.filters.append((f"in:{field}", values))
        return self

    def order(self, field: str, *, desc: bool = False) -> FakeQuery:
        self.ordering = (field, desc)
        return self

    def limit(self, value: int) -> FakeQuery:
        self.row_limit = value
        return self

    def insert(self, payload: dict) -> FakeQuery:
        self.operation, self.payload = "insert", payload
        return self

    def update(self, payload: dict) -> FakeQuery:
        self.operation, self.payload = "update", payload
        return self

    def upsert(self, payload: dict, on_conflict: str | None = None) -> FakeQuery:
        self.operation, self.payload, self.on_conflict = "upsert", payload, on_conflict
        return self

    async def execute(self):
        rows = self.db.rows.setdefault(self.table_name, [])
        if self.operation == "insert":
            row = {
                "id": str(uuid4()),
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
                **deepcopy(self.payload or {}),
            }
            rows.append(row)
            return SimpleNamespace(data=[deepcopy(row)])

        matched = []
        for row in rows:
            ok = True
            for field, value in self.filters:
                if field.startswith("in:"):
                    key = field.split(":", 1)[1]
                    if row.get(key) not in value:
                        ok = False
                        break
                elif row.get(field) != value:
                    ok = False
                    break
            if ok:
                matched.append(row)

        if self.operation == "update":
            for row in matched:
                row.update(deepcopy(self.payload or {}))
            return SimpleNamespace(data=deepcopy(matched))

        if self.operation == "upsert":
            payload = deepcopy(self.payload or {})
            conflict_fields = [f.strip() for f in (self.on_conflict or "").split(",") if f.strip()]
            existing = None
            if conflict_fields:
                for row in rows:
                    if all(str(row.get(f)) == str(payload.get(f)) for f in conflict_fields):
                        existing = row
                        break
            if existing:
                existing.update(payload)
                return SimpleNamespace(data=[deepcopy(existing)])
            row = {"id": str(uuid4()), **payload}
            rows.append(row)
            return SimpleNamespace(data=[deepcopy(row)])

        selected = deepcopy(matched)
        if self.ordering:
            field, desc = self.ordering
            selected.sort(key=lambda row: row.get(field) or "", reverse=desc)
        if self.row_limit is not None:
            selected = selected[: self.row_limit]
        return SimpleNamespace(data=selected)


class FakeSupabase:
    def __init__(self) -> None:
        self.rows: dict[str, list[dict]] = {}

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


@pytest.fixture
def org_a():
    return uuid4()


@pytest.fixture
def org_b():
    return uuid4()


@pytest.fixture
def tenant_a(org_a) -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=org_a,
        property_id=uuid4(),
        role="admin",
        jwt="test",
    )


@pytest.fixture
def tenant_b(org_b) -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=org_b,
        property_id=uuid4(),
        role="admin",
        jwt="test",
    )


@pytest.mark.anyio
async def test_supplier_onboarding_and_org_isolation(monkeypatch, tenant_a, tenant_b):
    db = FakeSupabase()
    service = SupplierNetworkService()
    monkeypatch.setattr(
        "app.services.supplier_network_service.get_async_supabase_admin",
        lambda: _async_client(db),
    )

    account = await service.create_account(
        tenant_a, SupplierAccountCreate(display_name="Fresh Farms SG")
    )
    assert account.display_name == "Fresh Farms SG"
    assert account.status == "onboarding"
    assert account.organization_id == tenant_a.org_id

    area = await service.add_service_area(
        tenant_a,
        SupplierServiceAreaCreate(name="Central", area_type="postal_code", area_value="01"),
    )
    assert area.vendor_id == account.vendor_id

    imported = await service.import_catalog(
        tenant_a,
        SupplierCatalogImportRequest(
            format="csv",
            csv_text="name,sku,unit\nRoma Tomato,TOM-1,kg\n",
        ),
    )
    assert imported.imported == 1
    assert len(db.rows.get("supplier_catalog_imports", [])) == 1

    terms = await service.upsert_commercial_terms(
        tenant_a,
        SupplierCommercialTermsUpsert(payment_terms="Net 14", minimum_order_value=150),
    )
    assert terms.payment_terms == "Net 14"

    activated = await service.activate_agent_endpoint(tenant_a)
    assert activated.agent_endpoint_enabled is True
    assert activated.onboarding_step == "complete"

    # Org B must not see Org A supplier account.
    other = await service.get_account(tenant_b)
    assert other is None
    summary_b = await service.workspace_summary(tenant_b)
    assert summary_b.account is None
    assert summary_b.metrics.rfqs_requiring_response == 0

    summary_a = await service.workspace_summary(tenant_a)
    assert summary_a.account is not None
    assert summary_a.onboarding_complete is True
    assert any(c.capability == "csv_import" for c in summary_a.capabilities)


async def _async_client(db: FakeSupabase):
    return db
