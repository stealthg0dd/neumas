from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.agent_commerce import ApiCredentialCreate, ServiceClientCreate
from app.services.agent_commerce_service import (
    AgentCommerceAuthError,
    AgentCommerceService,
)


class FakeQuery:
    def __init__(self, db: FakeSupabase, table: str) -> None:
        self.db = db
        self.table_name = table
        self.filters: list[tuple[str, object]] = []
        self.payload: dict | None = None
        self.operation = "select"
        self.selection = "*"
        self.start: int | None = None
        self.end: int | None = None
        self.row_limit: int | None = None

    def select(self, selection: str = "*") -> FakeQuery:
        self.selection = selection
        return self

    def eq(self, field: str, value: object) -> FakeQuery:
        self.filters.append((field, value))
        return self

    def order(self, *args, **kwargs) -> FakeQuery:
        return self

    def range(self, start: int, end: int) -> FakeQuery:
        self.start, self.end = start, end
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

    async def execute(self):
        rows = self.db.rows.setdefault(self.table_name, [])
        if self.operation == "insert":
            defaults = {
                "service_clients": {"status": "active", "revoked_at": None},
                "api_credentials": {"revoked_at": None, "last_used_at": None},
            }.get(self.table_name, {})
            row = {
                "id": str(uuid4()),
                "created_at": datetime.now(UTC).isoformat(),
                **defaults,
                **deepcopy(self.payload or {}),
            }
            rows.append(row)
            return SimpleNamespace(data=[deepcopy(row)])

        matched = [row for row in rows if all(row.get(field) == value for field, value in self.filters)]
        if self.operation == "update":
            for row in matched:
                row.update(deepcopy(self.payload or {}))
            return SimpleNamespace(data=deepcopy(matched))

        selected = deepcopy(matched)
        if self.table_name == "api_credentials" and "service_client:service_clients" in self.selection:
            clients = {row["id"]: row for row in self.db.rows.get("service_clients", [])}
            for row in selected:
                row["service_client"] = deepcopy(clients.get(row["service_client_id"]))
        if self.table_name == "supplier_items":
            ingredients = {row["id"]: row for row in self.db.rows.get("canonical_ingredients", [])}
            vendors = {row["id"]: row for row in self.db.rows.get("vendors", [])}
            for row in selected:
                row["ingredient"] = deepcopy(ingredients.get(row.get("canonical_ingredient_id")))
                row["vendor"] = deepcopy(vendors.get(row.get("vendor_id")))
                row["prices"] = [deepcopy(price) for price in self.db.rows.get("supplier_item_prices", []) if price.get("supplier_item_id") == row["id"]]
        if self.table_name == "supplier_item_offers" and "ingredient:canonical_ingredients" in self.selection:
            ingredients = {row["id"]: row for row in self.db.rows.get("canonical_ingredients", [])}
            for row in selected:
                row["ingredient"] = deepcopy(ingredients.get(row.get("canonical_ingredient_id")))
        if self.start is not None and self.end is not None:
            selected = selected[self.start : self.end + 1]
        if self.row_limit is not None:
            selected = selected[: self.row_limit]
        return SimpleNamespace(data=selected)


class FakeSupabase:
    def __init__(self, rows: dict[str, list[dict]]) -> None:
        self.rows = rows

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


@pytest.fixture
def commerce_db(monkeypatch):
    org_a, org_b = uuid4(), uuid4()
    supplier_a, supplier_b = uuid4(), uuid4()
    ingredient_a, ingredient_b = uuid4(), uuid4()
    item_a, item_b = uuid4(), uuid4()
    rows = {
        "service_clients": [], "agent_identities": [], "api_credentials": [], "delegations": [], "audit_logs": [],
        "vendors": [
            {"id": str(supplier_a), "organization_id": str(org_a), "name": "Tenant A Foods", "is_active": True},
            {"id": str(supplier_b), "organization_id": str(org_b), "name": "Tenant B Foods", "is_active": True},
        ],
        "canonical_ingredients": [
            {"id": str(ingredient_a), "canonical_name": "Tomato", "category": "Produce"},
            {"id": str(ingredient_b), "canonical_name": "Private Truffle", "category": "Produce"},
        ],
        "supplier_items": [
            {"id": str(item_a), "organization_id": str(org_a), "vendor_id": str(supplier_a), "canonical_ingredient_id": str(ingredient_a), "supplier_sku": "TOM-1", "pack_quantity": "1", "base_quantity": "1", "is_active": True},
            {"id": str(item_b), "organization_id": str(org_b), "vendor_id": str(supplier_b), "canonical_ingredient_id": str(ingredient_b), "supplier_sku": "SECRET-1", "pack_quantity": "1", "base_quantity": "1", "is_active": True},
        ],
        "supplier_item_prices": [
            {"id": str(uuid4()), "supplier_item_id": str(item_a), "price": "4.50", "currency": "SGD"},
            {"id": str(uuid4()), "supplier_item_id": str(item_b), "price": "99", "currency": "SGD"},
        ],
        "supplier_item_offers": [
            {"id": str(uuid4()), "organization_id": str(org_a), "vendor_id": str(supplier_a), "canonical_ingredient_id": str(ingredient_a), "supplier_sku": "TOM-1", "pack_quantity": "1", "normalized_base_quantity": "1", "unit_price": "4.50", "currency": "SGD", "moq": "1", "delivery_fee": "0", "lead_time_days": 1, "delivery_weekdays": [1, 3], "availability": "available", "approved": True},
            {"id": str(uuid4()), "organization_id": str(org_b), "vendor_id": str(supplier_b), "canonical_ingredient_id": str(ingredient_b), "supplier_sku": "SECRET-1", "pack_quantity": "1", "normalized_base_quantity": "1", "unit_price": "99", "currency": "SGD", "moq": "1", "delivery_fee": "0", "lead_time_days": 1, "delivery_weekdays": [2], "availability": "available", "approved": True},
        ],
        "supplier_performance_metrics": [],
    }
    db = FakeSupabase(rows)

    async def get_db():
        return db

    monkeypatch.setattr("app.services.agent_commerce_service.get_async_supabase_admin", get_db)
    monkeypatch.setattr("app.db.repositories.audit_logs.get_async_supabase_admin", get_db)
    return db, org_a, org_b, supplier_a, supplier_b


@pytest.mark.anyio
async def test_external_credential_flow_and_tenant_isolation(client, commerce_db):
    db, org_a, _, supplier_a, supplier_b = commerce_db
    service = AgentCommerceService()
    tenant = TenantContext(user_id=uuid4(), org_id=org_a, property_id=None, role="admin", jwt="test")
    application = await service.create_service_client(
        tenant,
        ServiceClientCreate(name="Procurement Agent", allowed_scopes=["supplier:read", "catalog:read", "offer:read", "availability:read"]),
    )
    generated = await service.generate_credential(
        tenant,
        application.id,
        ApiCredentialCreate(scopes=["supplier:read", "catalog:read", "offer:read", "availability:read"]),
    )

    stored = db.rows["api_credentials"][0]
    assert generated.api_key.startswith(f"nac_{stored['credential_prefix']}_")
    assert generated.api_key not in str(stored)
    assert stored["credential_hash"] == service.hash_api_key(generated.api_key)

    headers = {"X-API-Key": generated.api_key, "X-Correlation-ID": "commerce-test"}
    suppliers = await client.get("/api/agent-commerce/v1/suppliers", headers=headers)
    catalog = await client.get("/api/agent-commerce/v1/catalog/search", headers=headers)
    offers = await client.get("/api/agent-commerce/v1/offers", headers=headers)
    hidden_supplier = await client.get(f"/api/agent-commerce/v1/suppliers/{supplier_b}", headers=headers)

    assert suppliers.status_code == catalog.status_code == offers.status_code == 200, suppliers.text
    assert [row["id"] for row in suppliers.json()["data"]] == [str(supplier_a)]
    assert [row["supplier_sku"] for row in catalog.json()["data"]] == ["TOM-1"]
    assert [row["supplier_id"] for row in offers.json()["data"]] == [str(supplier_a)]
    assert hidden_supplier.status_code == 404
    assert hidden_supplier.json()["error"]["code"] == "supplier_not_found"
    assert suppliers.json()["correlation_id"] == "commerce-test"


@pytest.mark.anyio
async def test_revoked_credential_is_denied(commerce_db):
    _, org_a, _, _, _ = commerce_db
    service = AgentCommerceService()
    tenant = TenantContext(user_id=uuid4(), org_id=org_a, property_id=None, role="admin", jwt="test")
    application = await service.create_service_client(tenant, ServiceClientCreate(name="Revocation Test", allowed_scopes=["supplier:read"]))
    generated = await service.generate_credential(tenant, application.id, ApiCredentialCreate(scopes=["supplier:read"]))
    await service.revoke_credential(tenant, generated.id)

    with pytest.raises(AgentCommerceAuthError, match="revoked"):
        await service.authenticate(generated.api_key)
