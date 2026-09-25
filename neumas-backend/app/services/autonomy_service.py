from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.api.deps import TenantContext
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.autonomy import (
    ActionRecord,
    ActionRequest,
    AgentCenterSummary,
    DecisionInput,
    DecisionRecord,
    Policy,
    PolicyEvaluation,
)


class ActionProvider:
    async def execute(self, action: ActionRequest) -> dict[str, Any]:
        return {"status": "queued", "provider": action.provider}

    async def status(self, _action_id: UUID) -> dict[str, Any]:
        return {"status": "queued"}

    async def verify(self, _action_id: UUID) -> dict[str, Any]:
        return {"status": "pending"}

    async def cancel(self, _action_id: UUID) -> dict[str, Any]:
        return {"status": "cancelled"}


class ManualInternalProvider(ActionProvider):
    async def execute(self, action: ActionRequest) -> dict[str, Any]:
        return {"status": "manual_pending", "action_type": action.action_type, "external_write": False}


class AutonomyService:
    AGENTS = ["Demand Planner", "Procurement Agent", "Stock Guardian", "Supplier Optimizer", "Invoice Reconciler"]

    def __init__(self) -> None:
        self.providers: dict[str, ActionProvider] = {"manual_internal": ManualInternalProvider()}

    def evaluate_policy(self, policy: Policy, decision: DecisionInput) -> PolicyEvaluation:
        reasons: list[str] = []
        matched: list[str] = []
        blocked = False
        approval = policy.autonomy_mode in {"RECOMMEND_ONLY", "APPROVAL_REQUIRED"}
        action = decision.proposed_action
        evidence = decision.evidence
        for rule in policy.rules:
            match = self._rule_matches(rule.rule_type, rule.value, action, evidence, decision.confidence)
            if not match:
                continue
            matched.append(rule.rule_type)
            reasons.append(f"{rule.effect}: {rule.rule_type}")
            if rule.effect == "BLOCK":
                blocked = True
            if rule.effect == "APPROVAL_REQUIRED":
                approval = True
        if blocked:
            return PolicyEvaluation(result="BLOCKED", matched_rules=matched, reasons=reasons)
        if approval:
            return PolicyEvaluation(result="APPROVAL_REQUIRED", matched_rules=matched, reasons=reasons)
        return PolicyEvaluation(result="AUTO_EXECUTE_ALLOWED", matched_rules=matched, reasons=reasons or ["Policy allows auto execution"])

    def _rule_matches(self, rule_type: str, value: dict[str, Any], action: dict[str, Any], evidence: dict[str, Any], confidence: Decimal) -> bool:
        if rule_type == "max_po_amount":
            return Decimal(str(action.get("amount") or 0)) > Decimal(str(value.get("amount") or 0))
        if rule_type == "approved_suppliers_only":
            return not bool(evidence.get("supplier_approved", False))
        if rule_type == "max_quantity_increase_pct":
            return Decimal(str(evidence.get("quantity_increase_pct") or 0)) > Decimal(str(value.get("pct") or 0))
        if rule_type == "max_supplier_price_variance_pct":
            return Decimal(str(evidence.get("supplier_price_variance_pct") or 0)) > Decimal(str(value.get("pct") or 0))
        if rule_type == "min_confidence":
            return confidence < Decimal(str(value.get("confidence") or 0))
        if rule_type == "category_restrictions":
            return action.get("category") in set(value.get("blocked", []))
        if rule_type == "location_restrictions":
            return action.get("property_id") in set(value.get("blocked", []))
        if rule_type == "max_supplier_switch_pct":
            return Decimal(str(evidence.get("supplier_switch_pct") or 0)) > Decimal(str(value.get("pct") or 0))
        if rule_type == "max_automatic_credit_claim":
            return Decimal(str(action.get("credit_claim_amount") or 0)) > Decimal(str(value.get("amount") or 0))
        if rule_type == "blackout_windows":
            return bool(evidence.get("inside_blackout_window", False))
        return False

    async def create_decision(self, tenant: TenantContext, payload: DecisionInput, policy: Policy | None = None) -> DecisionRecord:
        client = await get_async_supabase_admin()
        policy = policy or Policy(name="Default approval policy", autonomy_mode="APPROVAL_REQUIRED", rules=[])
        evaluation = self.evaluate_policy(policy, payload)
        existing = await client.table("decisions").select("*").eq("organization_id", str(tenant.org_id)).eq("property_id", str(tenant.property_id)).eq("idempotency_key", payload.idempotency_key).limit(1).execute()
        if existing.data:
            return self._decision_record(existing.data[0], [], [], [])
        decision_id = uuid4()
        row = {
            "id": str(decision_id),
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "trigger_type": payload.trigger_type,
            "subject_type": payload.subject_type,
            "subject_id": str(payload.subject_id) if payload.subject_id else None,
            "decision_type": payload.decision_type,
            "title": payload.title,
            "proposed_action": payload.proposed_action,
            "confidence": str(payload.confidence),
            "policy_result": evaluation.result,
            "status": "blocked" if evaluation.result == "BLOCKED" else "approval_required" if evaluation.result == "APPROVAL_REQUIRED" else "approved",
            "idempotency_key": payload.idempotency_key,
            "created_by_agent": payload.created_by_agent,
        }
        await client.table("decisions").insert(row).execute()
        evidence_hash = hashlib.sha256(json.dumps(payload.evidence, sort_keys=True).encode()).hexdigest()
        evidence_row = {
            "decision_id": str(decision_id),
            "organization_id": str(tenant.org_id),
            "evidence_type": "decision_input",
            "evidence": payload.evidence,
            "evidence_hash": evidence_hash,
        }
        await client.table("decision_evidence").insert(evidence_row).execute()
        if evaluation.result == "APPROVAL_REQUIRED":
            await client.table("approvals").insert({
                "organization_id": str(tenant.org_id),
                "property_id": str(tenant.property_id) if tenant.property_id else None,
                "decision_id": str(decision_id),
                "status": "pending",
            }).execute()
        return self._decision_record(row, [evidence_row], [], [])

    async def execute_action(self, tenant: TenantContext, request: ActionRequest, *, fail: bool = False) -> ActionRecord:
        client = await get_async_supabase_admin()
        existing = await client.table("actions").select("*").eq("organization_id", str(tenant.org_id)).eq("property_id", str(tenant.property_id)).eq("idempotency_key", request.idempotency_key).limit(1).execute()
        if existing.data:
            return self._action_record(existing.data[0], [])
        action_id = uuid4()
        row = {
            "id": str(action_id),
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "decision_id": str(request.decision_id) if request.decision_id else None,
            "provider": request.provider,
            "action_type": request.action_type,
            "payload": request.payload,
            "state": "pending",
            "idempotency_key": request.idempotency_key,
        }
        await client.table("actions").insert(row).execute()
        provider = self.providers.get(request.provider, ManualInternalProvider())
        try:
            if fail:
                raise RuntimeError("forced failure")
            response = await provider.execute(request)
            state = "queued" if response.get("status") in {"queued", "manual_pending"} else "succeeded"
            failure = None
        except Exception as exc:
            response = {"error": str(exc)}
            state = "failed"
            failure = str(exc)
        attempt = {
            "action_id": str(action_id),
            "organization_id": str(tenant.org_id),
            "attempt_number": 1,
            "status": state,
            "request_payload": request.payload,
            "response_payload": response,
            "failure_reason": failure,
        }
        await client.table("action_attempts").insert(attempt).execute()
        await client.table("actions").update({"state": state, "failure_reason": failure, "updated_at": datetime.now(UTC).isoformat()}).eq("id", str(action_id)).eq("organization_id", str(tenant.org_id)).execute()
        row["state"] = state
        row["failure_reason"] = failure
        return self._action_record(row, [attempt])

    async def retry_action(self, tenant: TenantContext, action_id: UUID) -> ActionRecord:
        client = await get_async_supabase_admin()
        action_resp = await client.table("actions").select("*").eq("id", str(action_id)).eq("organization_id", str(tenant.org_id)).eq("property_id", str(tenant.property_id)).limit(1).execute()
        if not action_resp.data:
            raise ValueError("Action not found")
        action = action_resp.data[0]
        attempts_resp = await client.table("action_attempts").select("*").eq("action_id", str(action_id)).eq("organization_id", str(tenant.org_id)).order("attempt_number", desc=True).limit(1).execute()
        next_attempt = int((attempts_resp.data or [{"attempt_number": 0}])[0].get("attempt_number") or 0) + 1
        attempt = {"action_id": str(action_id), "organization_id": str(tenant.org_id), "attempt_number": next_attempt, "status": "queued", "request_payload": action.get("payload") or {}, "response_payload": {"status": "manual_pending"}}
        await client.table("action_attempts").insert(attempt).execute()
        await client.table("actions").update({"state": "queued", "failure_reason": None}).eq("id", str(action_id)).eq("organization_id", str(tenant.org_id)).execute()
        action["state"] = "queued"
        action["failure_reason"] = None
        return self._action_record(action, [attempt])

    async def list_decisions(self, tenant: TenantContext) -> list[DecisionRecord]:
        client = await get_async_supabase_admin()
        resp = await client.table("decisions").select("*").eq("organization_id", str(tenant.org_id)).eq("property_id", str(tenant.property_id)).order("created_at", desc=True).limit(50).execute()
        return [self._decision_record(row, [], [], []) for row in resp.data or []]

    async def agent_summary(self, tenant: TenantContext) -> AgentCenterSummary:
        decisions = await self.list_decisions(tenant)
        tasks = [
            {
                "agent": decision.created_by_agent or "Procurement Agent",
                "task": decision.title,
                "reason": decision.decision_type,
                "confidence": str(decision.confidence),
                "policy": decision.policy_result,
                "progress": ["Detect", "Evaluate", "Policy", "Execute" if decision.status == "approved" else "Approval", "Verify", "Learn"],
                "status": decision.status,
            }
            for decision in decisions
        ]
        compliance = Decimal("1.00") if decisions and all(d.policy_result != "BLOCKED" for d in decisions) else Decimal("0.00") if decisions else None
        return AgentCenterSummary(
            active_agents=len(self.AGENTS),
            tasks_executed=len(decisions),
            policy_compliance=compliance,
            time_saved_hours=None,
            actions_executed=sum(1 for d in decisions if d.status == "approved"),
            savings_captured=None,
            tasks=tasks,
            activity_feed=tasks[:10],
            policy_boundaries=[{"name": "Default approval boundary", "mode": "APPROVAL_REQUIRED"}],
            autonomy_level="APPROVAL_REQUIRED",
            exception_watchlist=[task for task in tasks if task["status"] in {"blocked", "approval_required"}],
        )

    def _decision_record(self, row: dict[str, Any], evidence: list[dict[str, Any]], approvals: list[dict[str, Any]], actions: list[dict[str, Any]]) -> DecisionRecord:
        return DecisionRecord(
            id=UUID(str(row["id"])),
            title=str(row["title"]),
            decision_type=str(row["decision_type"]),
            proposed_action=row.get("proposed_action") or {},
            confidence=Decimal(str(row.get("confidence") or 0)),
            policy_result=str(row.get("policy_result") or "APPROVAL_REQUIRED"),
            status=str(row.get("status") or "pending"),
            created_by_agent=row.get("created_by_agent"),
            created_at=row.get("created_at"),
            evidence=evidence,
            approvals=approvals,
            actions=actions,
        )

    def _action_record(self, row: dict[str, Any], attempts: list[dict[str, Any]]) -> ActionRecord:
        return ActionRecord(
            id=UUID(str(row["id"])),
            provider=str(row["provider"]),
            action_type=str(row["action_type"]),
            payload=row.get("payload") or {},
            state=str(row.get("state") or "pending"),
            idempotency_key=str(row["idempotency_key"]),
            failure_reason=row.get("failure_reason"),
            attempts=attempts,
        )
