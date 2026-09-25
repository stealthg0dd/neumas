from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.autonomy import ActionRequest, DecisionInput, Policy, PolicyRule
from app.services.autonomy_service import AutonomyService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(user_id=uuid4(), org_id=uuid4(), property_id=uuid4(), role="admin", jwt="test")


def decision(amount="100", confidence="0.9") -> DecisionInput:
    return DecisionInput(
        trigger_type="procurement_recommendation",
        subject_type="canonical_ingredient",
        decision_type="purchase",
        title="Buy chicken",
        proposed_action={"amount": amount, "supplier_id": "supplier-1"},
        evidence={"supplier_approved": True, "forecast": "120kg"},
        confidence=Decimal(confidence),
        idempotency_key=f"decision-{amount}-{confidence}",
    )


def test_policy_allow_approval_required_and_block():
    service = AutonomyService()
    allow = Policy(name="auto", autonomy_mode="AUTO_EXECUTE", rules=[])
    approval = Policy(name="approval", autonomy_mode="AUTO_EXECUTE", rules=[PolicyRule(rule_type="max_po_amount", value={"amount": "50"}, effect="APPROVAL_REQUIRED")])
    block = Policy(name="block", autonomy_mode="AUTO_EXECUTE", rules=[PolicyRule(rule_type="approved_suppliers_only", value={}, effect="BLOCK")])
    blocked_decision = decision()
    blocked_decision.evidence["supplier_approved"] = False

    assert service.evaluate_policy(allow, decision()).result == "AUTO_EXECUTE_ALLOWED"
    assert service.evaluate_policy(approval, decision("100")).result == "APPROVAL_REQUIRED"
    assert service.evaluate_policy(block, blocked_decision).result == "BLOCKED"


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = []
        self.pending = None
        self.client.filters.setdefault(table, [])

    def select(self, *_args):
        return self

    def eq(self, key, value):
        self.filters.append((key, str(value)))
        self.client.filters[self.table].append((key, str(value)))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def insert(self, payload):
        row = dict(payload)
        row.setdefault("id", str(uuid4()))
        self.client.rows.setdefault(self.table, []).append(row)
        self.client.inserts.append((self.table, row))
        self.pending = [row]
        return self

    def update(self, payload):
        self.client.updates.append((self.table, payload))
        return self

    async def execute(self):
        if self.pending is not None:
            return _Resp(self.pending)
        rows = list(self.client.rows.get(self.table, []))
        for key, value in self.filters:
            rows = [row for row in rows if str(row.get(key)) == value]
        return _Resp(rows)


class _Client:
    def __init__(self):
        self.rows = {}
        self.inserts = []
        self.updates = []
        self.filters = {}

    def table(self, table):
        return _Query(self, table)


@pytest.mark.asyncio
async def test_decision_evidence_is_immutable_and_tenant_isolated(monkeypatch, tenant: TenantContext):
    client = _Client()
    monkeypatch.setattr("app.services.autonomy_service.get_async_supabase_admin", AsyncMock(return_value=client))

    record = await AutonomyService().create_decision(tenant, decision(), Policy(name="approval", autonomy_mode="APPROVAL_REQUIRED"))

    evidence = client.inserts[1][1]
    assert record.status == "approval_required"
    assert evidence["evidence_hash"]
    assert ("organization_id", str(tenant.org_id)) in client.filters["decisions"]
    assert ("property_id", str(tenant.property_id)) in client.filters["decisions"]


@pytest.mark.asyncio
async def test_idempotent_action_duplicate_execution_prevention_and_attempt_ledger(monkeypatch, tenant: TenantContext):
    client = _Client()
    monkeypatch.setattr("app.services.autonomy_service.get_async_supabase_admin", AsyncMock(return_value=client))
    service = AutonomyService()
    request = ActionRequest(provider="manual_internal", action_type="create_po", payload={"po": 1}, idempotency_key="act-1")

    first = await service.execute_action(tenant, request)
    second = await service.execute_action(tenant, request)

    assert first.id == second.id
    assert len([row for table, row in client.inserts if table == "actions"]) == 1
    assert len([row for table, row in client.inserts if table == "action_attempts"]) == 1


@pytest.mark.asyncio
async def test_failed_action_and_retry(monkeypatch, tenant: TenantContext):
    client = _Client()
    monkeypatch.setattr("app.services.autonomy_service.get_async_supabase_admin", AsyncMock(return_value=client))
    service = AutonomyService()
    failed = await service.execute_action(tenant, ActionRequest(provider="manual_internal", action_type="create_po", payload={}, idempotency_key="act-fail"), fail=True)
    retried = await service.retry_action(tenant, failed.id)

    assert failed.state == "failed"
    assert retried.state == "queued"
    attempts = [row for table, row in client.inserts if table == "action_attempts"]
    assert len(attempts) == 2
    assert attempts[-1]["attempt_number"] == 2


@pytest.mark.asyncio
async def test_agent_summary_uses_tenant_scoped_decisions(monkeypatch, tenant: TenantContext):
    client = _Client()
    client.rows["decisions"] = [{
        "id": str(uuid4()),
        "organization_id": str(tenant.org_id),
        "property_id": str(tenant.property_id),
        "title": "Buy tomatoes",
        "decision_type": "purchase",
        "proposed_action": {},
        "confidence": "0.8",
        "policy_result": "APPROVAL_REQUIRED",
        "status": "approval_required",
        "created_by_agent": "Procurement Agent",
    }]
    monkeypatch.setattr("app.services.autonomy_service.get_async_supabase_admin", AsyncMock(return_value=client))

    summary = await AutonomyService().agent_summary(tenant)
    assert summary.active_agents == 5
    assert summary.tasks_executed == 1
    assert ("organization_id", str(tenant.org_id)) in client.filters["decisions"]
