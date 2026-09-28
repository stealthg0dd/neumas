from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from app.db.supabase_client import get_async_supabase_admin
from app.schemas.agent_commerce import ExternalPrincipal
from app.schemas.autonomy import DecisionInput
from app.schemas.exchange import CounterOfferInput, RfqCreate
from app.schemas.procurement import IngredientRequirement, SupplierOffer
from app.services.agent_commerce_service import AgentCommerceService
from app.services.autonomy_service import AutonomyService
from app.services.exchange_service import ExchangeService
from app.services.procurement_optimizer_service import ProcurementOptimizerService


class McpService:
    TOOL_SCOPES = {
        "search_suppliers": "supplier:read", "search_catalog": "catalog:read", "get_supplier_offer": "offer:read",
        "get_availability": "availability:read", "create_rfq": "rfq:create", "get_rfq": "rfq:read",
        "get_rfq_offers": "offer:read", "counter_offer": "rfq:create", "get_procurement_recommendation": "order:read",
        "simulate_purchase": "order:read", "create_purchase_decision": "order:create", "get_decision_evidence": "order:read",
        "request_purchase": "order:create", "get_order_status": "order:read", "get_reconciliation_status": "order:read",
    }
    TRANSACTIONAL = {"create_rfq", "counter_offer", "create_purchase_decision", "request_purchase"}

    def __init__(self) -> None:
        self.commerce = AgentCommerceService()
        self.exchange = ExchangeService()
        self.optimizer = ProcurementOptimizerService()
        self.autonomy = AutonomyService()

    def tools(self) -> list[dict[str, Any]]:
        definitions = {
            "search_suppliers": ("Search approved supplier records", {"query": {"type": "string"}}),
            "search_catalog": ("Search canonical supplier catalog", {"query": {"type": "string"}}),
            "get_supplier_offer": ("Get supplier commercial offers", {"supplier_id": {"type": "string"}}),
            "get_availability": ("Get supplier availability", {"supplier_id": {"type": "string"}}),
            "create_rfq": ("Create a structured RFQ", {"rfq": {"type": "object"}, "idempotency_key": {"type": "string"}}),
            "get_rfq": ("Get an RFQ", {"rfq_id": {"type": "string"}}),
            "get_rfq_offers": ("Get structured RFQ offers", {"rfq_id": {"type": "string"}}),
            "counter_offer": ("Create a structured counteroffer", {"offer_id": {"type": "string"}, "terms": {"type": "object"}, "idempotency_key": {"type": "string"}}),
            "get_procurement_recommendation": ("Get persisted procurement recommendations", {}),
            "simulate_purchase": ("Run deterministic purchase optimization without executing", {"requirement": {"type": "object"}, "offers": {"type": "array"}}),
            "create_purchase_decision": ("Create a policy-evaluated purchase decision", {"decision": {"type": "object"}, "idempotency_key": {"type": "string"}}),
            "get_decision_evidence": ("Get immutable decision evidence", {"decision_id": {"type": "string"}}),
            "request_purchase": ("Request a policy-controlled purchase", {"decision": {"type": "object"}, "idempotency_key": {"type": "string"}}),
            "get_order_status": ("Get purchase order status", {"order_id": {"type": "string"}}),
            "get_reconciliation_status": ("Get reconciliation status", {"reconciliation_id": {"type": "string"}}),
        }
        return [{"name": name, "description": description, "inputSchema": {"type": "object", "properties": properties}} for name, (description, properties) in definitions.items()]

    async def call(self, principal: ExternalPrincipal, name: str, arguments: dict[str, Any]) -> Any:
        required_scope = self.TOOL_SCOPES.get(name)
        if required_scope is None:
            raise ValueError("Unknown tool")
        if not principal.has_scope(required_scope):
            raise PermissionError(f"Requires scope: {required_scope}")
        if name in self.TRANSACTIONAL and not str(arguments.get("idempotency_key") or "").strip():
            raise ValueError("idempotency_key is required for transactional tools")
        if name == "search_suppliers":
            rows = await self.commerce.list_suppliers(principal, limit=100, offset=0)
            query = str(arguments.get("query") or "").lower()
            return [row.model_dump(mode="json") for row in rows if not query or query in row.name.lower()]
        if name == "search_catalog":
            return [row.model_dump(mode="json") for row in await self.commerce.search_catalog(principal, query=arguments.get("query"), limit=100, offset=0)]
        if name in {"get_supplier_offer", "get_availability"}:
            supplier_id = UUID(str(arguments["supplier_id"])) if arguments.get("supplier_id") else None
            if name == "get_supplier_offer":
                return [row.model_dump(mode="json") for row in await self.commerce.list_offers(principal, supplier_id=supplier_id, limit=100, offset=0)]
            return [row.model_dump(mode="json") for row in await self.commerce.list_availability(principal, supplier_id=supplier_id, limit=100, offset=0)]
        if name == "create_rfq":
            record = await self.exchange.create_rfq(principal, RfqCreate(**arguments["rfq"]), str(arguments["idempotency_key"]))
            return record.model_dump(mode="json")
        if name == "get_rfq":
            record = await self.exchange.get_rfq(principal, UUID(str(arguments["rfq_id"])), required=True)
            return record.model_dump(mode="json")
        if name == "get_rfq_offers":
            return await self.exchange.list_offers(principal, UUID(str(arguments["rfq_id"])))
        if name == "counter_offer":
            return await self.exchange.counter_offer(principal, UUID(str(arguments["offer_id"])), CounterOfferInput(**arguments["terms"]))
        if name == "get_procurement_recommendation":
            summary = await self.optimizer.summary(self.exchange.tenant_for(principal))
            return summary.model_dump(mode="json")
        if name == "simulate_purchase":
            recommendation = self.optimizer.optimize(IngredientRequirement(**arguments["requirement"]), [SupplierOffer(**row) for row in arguments["offers"]], required_by=date.today())
            return recommendation.model_dump(mode="json")
        if name in {"create_purchase_decision", "request_purchase"}:
            decision_data = dict(arguments["decision"])
            decision_data["idempotency_key"] = str(arguments["idempotency_key"])
            decision = await self.autonomy.create_decision(self.exchange.tenant_for(principal), DecisionInput(**decision_data))
            return decision.model_dump(mode="json")
        client = await get_async_supabase_admin()
        if name == "get_decision_evidence":
            response = await client.table("decision_evidence").select("*").eq("organization_id", str(principal.organization_id)).eq("decision_id", str(arguments["decision_id"])).execute()
            return response.data or []
        if name == "get_order_status":
            response = await client.table("purchase_orders").select("*").eq("organization_id", str(principal.organization_id)).eq("id", str(arguments["order_id"])).limit(1).execute()
            return response.data[0] if response.data else None
        response = await client.table("reconciliation_cases").select("*").eq("organization_id", str(principal.organization_id)).eq("id", str(arguments["reconciliation_id"])).limit(1).execute()
        return response.data[0] if response.data else None
