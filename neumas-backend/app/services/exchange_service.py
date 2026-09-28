from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.db.repositories.audit_logs import AuditLogsRepository
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.agent_commerce import ExternalPrincipal
from app.schemas.autonomy import DecisionInput
from app.schemas.exchange import (
    CounterOfferInput,
    ExchangeSummary,
    OfferTermsInput,
    RfqCreate,
    RfqRecord,
)
from app.schemas.procurement import IngredientRequirement, SupplierOffer
from app.services.autonomy_service import AutonomyService
from app.services.procurement_optimizer_service import ProcurementOptimizerService


class ExchangeService:
    def __init__(self) -> None:
        self.optimizer = ProcurementOptimizerService()
        self.autonomy = AutonomyService()
        self.audit = AuditLogsRepository()

    def tenant_for(self, principal: ExternalPrincipal, property_id: UUID | None = None) -> TenantContext:
        if property_id and principal.allowed_property_ids and property_id not in principal.allowed_property_ids:
            raise ValueError("Property is outside this delegation")
        selected = property_id or (principal.allowed_property_ids[0] if len(principal.allowed_property_ids) == 1 else None)
        return TenantContext(user_id=principal.service_client_id, org_id=principal.organization_id, property_id=selected, role="service", jwt="service-client")

    async def create_rfq(self, principal: ExternalPrincipal, payload: RfqCreate, idempotency_key: str) -> RfqRecord:
        tenant = self.tenant_for(principal, payload.property_id)
        supplier_ids = [supplier_id for supplier_id in payload.supplier_ids if self._supplier_allowed(principal, supplier_id)]
        if len(supplier_ids) != len(payload.supplier_ids):
            raise ValueError("One or more suppliers are outside this delegation")
        client = await get_async_supabase_admin()
        existing = await client.table("rfqs").select("*").eq("organization_id", str(principal.organization_id)).eq("idempotency_key", idempotency_key).limit(1).execute()
        if existing.data:
            return await self.get_rfq(principal, UUID(str(existing.data[0]["id"])), required=True)
        row = {
            "organization_id": str(principal.organization_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "title": payload.title,
            "status": "OPEN",
            "currency": payload.currency.upper(),
            "required_by": payload.required_by.isoformat() if payload.required_by else None,
            "response_deadline": payload.response_deadline.isoformat() if payload.response_deadline else None,
            "notes": payload.notes,
            "idempotency_key": idempotency_key,
            "created_by_service_client_id": str(principal.service_client_id),
        }
        created = await client.table("rfqs").insert(row).execute()
        rfq_id = str(created.data[0]["id"])
        for item in payload.items:
            await client.table("rfq_items").insert({
                "rfq_id": rfq_id,
                "organization_id": str(principal.organization_id),
                "canonical_ingredient_id": str(item.canonical_ingredient_id),
                "quantity": str(item.quantity),
                "uom_id": str(item.uom_id) if item.uom_id else None,
                "normalized_base_quantity": str(item.normalized_base_quantity),
                "specifications": item.specifications,
            }).execute()
        for supplier_id in supplier_ids:
            await client.table("supplier_invitations").insert({"rfq_id": rfq_id, "organization_id": str(principal.organization_id), "vendor_id": str(supplier_id)}).execute()
        await self.audit.log_admin(str(principal.organization_id), str(principal.service_client_id), "exchange.rfq_created", "rfqs", resource_id=rfq_id, actor_role="service", metadata={"supplier_count": len(supplier_ids)})
        return await self.get_rfq(principal, UUID(rfq_id), required=True)

    async def list_rfqs(self, principal: ExternalPrincipal, limit: int = 50, offset: int = 0) -> list[RfqRecord]:
        client = await get_async_supabase_admin()
        response = await client.table("rfqs").select("*").eq("organization_id", str(principal.organization_id)).order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        records: list[RfqRecord] = []
        for row in response.data or []:
            if self._property_allowed(principal, row.get("property_id")):
                records.append(await self._hydrate(row))
        return records

    async def get_rfq(self, principal: ExternalPrincipal, rfq_id: UUID, *, required: bool = False) -> RfqRecord | None:
        client = await get_async_supabase_admin()
        response = await client.table("rfqs").select("*").eq("id", str(rfq_id)).eq("organization_id", str(principal.organization_id)).limit(1).execute()
        if not response.data or not self._property_allowed(principal, response.data[0].get("property_id")):
            if required:
                raise ValueError("RFQ not found")
            return None
        return await self._hydrate(response.data[0])

    async def submit_offer(self, principal: ExternalPrincipal, rfq_id: UUID, payload: OfferTermsInput, idempotency_key: str) -> dict[str, Any]:
        rfq = await self.get_rfq(principal, rfq_id, required=True)
        if rfq.status not in {"OPEN", "QUOTING", "NEGOTIATING"}:
            raise ValueError("RFQ is not accepting offers")
        if not self._supplier_allowed(principal, payload.vendor_id):
            raise ValueError("Supplier is outside this delegation")
        invited = {str(row.get("vendor_id")) for row in rfq.invitations}
        if str(payload.vendor_id) not in invited:
            raise ValueError("Supplier was not invited to this RFQ")
        client = await get_async_supabase_admin()
        existing = await client.table("rfq_offer_responses").select("*").eq("organization_id", str(principal.organization_id)).eq("idempotency_key", idempotency_key).limit(1).execute()
        if existing.data:
            return await self._offer_detail(existing.data[0])
        response = await client.table("rfq_offer_responses").insert({
            "rfq_id": str(rfq_id), "organization_id": str(principal.organization_id), "vendor_id": str(payload.vendor_id),
            "status": "SUBMITTED", "current_version": 1, "idempotency_key": idempotency_key,
            "submitted_by_service_client_id": str(principal.service_client_id),
        }).execute()
        offer = response.data[0]
        await self._insert_version(principal, offer, payload, 1, "SUBMITTED", "SUPPLIER")
        await client.table("rfqs").update({"status": "QUOTING"}).eq("id", str(rfq_id)).eq("organization_id", str(principal.organization_id)).execute()
        await client.table("supplier_invitations").update({"status": "RESPONDED"}).eq("rfq_id", str(rfq_id)).eq("vendor_id", str(payload.vendor_id)).eq("organization_id", str(principal.organization_id)).execute()
        await self.audit.log_admin(str(principal.organization_id), str(principal.service_client_id), "exchange.offer_submitted", "rfq_offer_responses", resource_id=str(offer["id"]), actor_role="service")
        return await self._offer_detail(offer)

    async def list_offers(self, principal: ExternalPrincipal, rfq_id: UUID) -> list[dict[str, Any]]:
        await self.get_rfq(principal, rfq_id, required=True)
        client = await get_async_supabase_admin()
        response = await client.table("rfq_offer_responses").select("*").eq("rfq_id", str(rfq_id)).eq("organization_id", str(principal.organization_id)).order("created_at").execute()
        return [await self._offer_detail(row) for row in response.data or [] if self._supplier_allowed(principal, UUID(str(row["vendor_id"])))]

    async def counter_offer(self, principal: ExternalPrincipal, offer_id: UUID, payload: CounterOfferInput) -> dict[str, Any]:
        offer = await self._owned_offer(principal, offer_id)
        if UUID(str(offer["vendor_id"])) != payload.vendor_id:
            raise ValueError("Counteroffer supplier cannot change")
        version = int(offer.get("current_version") or 1) + 1
        client = await get_async_supabase_admin()
        await self._insert_version(principal, offer, payload, version, "COUNTERED", "BUYER")
        await client.table("rfq_offer_responses").update({"status": "COUNTERED", "current_version": version}).eq("id", str(offer_id)).eq("organization_id", str(principal.organization_id)).execute()
        await client.table("rfqs").update({"status": "NEGOTIATING"}).eq("id", str(offer["rfq_id"])).eq("organization_id", str(principal.organization_id)).execute()
        for event_type in payload.event_types:
            await client.table("negotiation_events").insert({
                "rfq_id": str(offer["rfq_id"]), "offer_response_id": str(offer_id), "organization_id": str(principal.organization_id),
                "event_type": event_type, "from_version": version - 1, "to_version": version,
                "changes": payload.model_dump(mode="json", exclude={"event_types"}), "actor_type": "BUYER", "actor_id": str(principal.service_client_id),
            }).execute()
        await self.audit.log_admin(str(principal.organization_id), str(principal.service_client_id), "exchange.offer_countered", "rfq_offer_responses", resource_id=str(offer_id), actor_role="service", metadata={"version": version, "event_types": payload.event_types})
        return await self._offer_detail({**offer, "status": "COUNTERED", "current_version": version})

    async def set_offer_status(self, principal: ExternalPrincipal, offer_id: UUID, status: str) -> dict[str, Any]:
        offer = await self._owned_offer(principal, offer_id)
        client = await get_async_supabase_admin()
        await client.table("rfq_offer_responses").update({"status": status}).eq("id", str(offer_id)).eq("organization_id", str(principal.organization_id)).execute()
        await self.audit.log_admin(str(principal.organization_id), str(principal.service_client_id), f"exchange.offer_{status.lower()}", "rfq_offer_responses", resource_id=str(offer_id), actor_role="service")
        if status == "ACCEPTED":
            await client.table("rfqs").update({"status": "SELECTED"}).eq("id", str(offer["rfq_id"])).eq("organization_id", str(principal.organization_id)).execute()
            recommendation, decision = await self.optimize_and_decide(principal, UUID(str(offer["rfq_id"])))
            result = await self._offer_detail({**offer, "status": status})
            result["recommendation"] = recommendation
            result["decision"] = decision
            return result
        return await self._offer_detail({**offer, "status": status})

    async def optimize_and_decide(self, principal: ExternalPrincipal, rfq_id: UUID) -> tuple[dict[str, Any], dict[str, Any]]:
        rfq = await self.get_rfq(principal, rfq_id, required=True)
        offers = await self.list_offers(principal, rfq_id)
        all_allocations: list[dict[str, Any]] = []
        expected_total = Decimal("0")
        baseline_total = Decimal("0")
        client = await get_async_supabase_admin()
        for item in rfq.items:
            supplier_offers: list[SupplierOffer] = []
            for offer in offers:
                version = offer.get("current_terms") or {}
                for line in version.get("line_items") or []:
                    if str(line.get("canonical_ingredient_id")) != str(item["canonical_ingredient_id"]):
                        continue
                    supplier_offers.append(SupplierOffer(
                        id=UUID(str(offer["id"])), vendor_id=UUID(str(offer["vendor_id"])), vendor_name=str(offer.get("vendor_name") or "Supplier"),
                        canonical_ingredient_id=UUID(str(item["canonical_ingredient_id"])), pack_quantity=Decimal(str(line.get("pack_quantity") or 1)),
                        normalized_base_quantity=Decimal(str(line.get("normalized_base_quantity") or 1)), unit_price=Decimal(str(line.get("unit_price") or 0)),
                        currency=str(version.get("currency") or rfq.currency), moq=Decimal(str(line.get("moq") or 0)),
                        delivery_fee=Decimal(str(version.get("delivery_fee") or 0)), lead_time_days=int(version.get("lead_time_days") or 0),
                        availability=str(line.get("availability") or version.get("availability") or "available"), approved=True,
                    ))
            requirement = IngredientRequirement(
                canonical_ingredient_id=UUID(str(item["canonical_ingredient_id"])), ingredient_name=str(item.get("ingredient_name") or "Ingredient"),
                demand_quantity=Decimal(str(item["normalized_base_quantity"])), reorder_horizon_days=7,
            )
            recommendation = self.optimizer.optimize(requirement, supplier_offers, required_by=rfq.required_by or date.today())
            all_allocations.extend(allocation.model_dump(mode="json") for allocation in recommendation.selected_allocations)
            expected_total += recommendation.expected_cost
            baseline_total += recommendation.baseline_cost or recommendation.expected_cost
            await client.table("procurement_recommendations").insert({
                "organization_id": str(principal.organization_id), "property_id": str(rfq.property_id) if rfq.property_id else None,
                "canonical_ingredient_id": str(recommendation.canonical_ingredient_id), "required_quantity": str(recommendation.required_quantity),
                "selected_allocations": recommendation.model_dump(mode="json")["selected_allocations"], "expected_cost": str(recommendation.expected_cost),
                "baseline_cost": str(recommendation.baseline_cost) if recommendation.baseline_cost is not None else None,
                "expected_savings": str(recommendation.expected_savings) if recommendation.expected_savings is not None else None,
                "tradeoffs": recommendation.tradeoffs, "evidence": {**recommendation.evidence, "rfq_id": str(rfq_id)},
                "confidence": str(recommendation.confidence), "risk": recommendation.risk, "status": "recommended",
            }).execute()
        recommendation_payload = {"rfq_id": str(rfq_id), "allocations": all_allocations, "expected_cost": str(expected_total), "baseline_cost": str(baseline_total), "expected_savings": str(baseline_total - expected_total)}
        decision = await self.autonomy.create_decision(
            self.tenant_for(principal, rfq.property_id),
            DecisionInput(trigger_type="rfq_offer_selected", subject_type="rfq", subject_id=rfq_id, decision_type="purchase_rfq_allocation", title=f"Purchase allocation for {rfq.title}", proposed_action={"amount": str(expected_total), "currency": rfq.currency, "allocations": all_allocations}, evidence=recommendation_payload, confidence=Decimal("0.85") if all_allocations else Decimal("0"), idempotency_key=f"rfq:{rfq_id}:decision", created_by_agent="Procurement Agent"),
        )
        return recommendation_payload, decision.model_dump(mode="json")

    async def summary(self, principal: ExternalPrincipal) -> ExchangeSummary:
        rfqs = await self.list_rfqs(principal, 100, 0)
        offers = [offer for rfq in rfqs for offer in rfq.offers]
        client = await get_async_supabase_admin()
        po = await client.table("purchase_orders").select("*").eq("organization_id", str(principal.organization_id)).limit(100).execute()
        approvals = await client.table("approvals").select("*").eq("organization_id", str(principal.organization_id)).eq("status", "pending").limit(50).execute()
        active_clients = await client.table("service_clients").select("*").eq("organization_id", str(principal.organization_id)).eq("status", "active").limit(100).execute()
        totals = [Decimal(str((offer.get("current_terms") or {}).get("landed_total") or 0)) for offer in offers]
        activity = sorted([event for rfq in rfqs for event in rfq.negotiation_events], key=lambda event: str(event.get("created_at") or ""), reverse=True)
        return ExchangeSummary(
            rfq_value=sum(totals, Decimal("0")) if totals else None,
            active_rfqs=sum(1 for rfq in rfqs if rfq.status in {"OPEN", "QUOTING", "NEGOTIATING"}), offers_received=len(offers),
            orders_created=len(po.data or []), commercial_improvement=self._commercial_improvement(offers),
            active_buyer_agents=len(active_clients.data or []), active_suppliers=len({str(offer.get("vendor_id")) for offer in offers}),
            rfqs=rfqs, recent_offers=offers[:10], negotiations_requiring_action=[offer for offer in offers if offer.get("status") == "COUNTERED"],
            policy_approvals=approvals.data or [], orders_in_flight=[row for row in po.data or [] if row.get("state") not in {"RECEIVED", "CANCELLED", "FAILED"}], network_activity=activity[:20],
        )

    async def _hydrate(self, row: dict[str, Any]) -> RfqRecord:
        client = await get_async_supabase_admin()
        rfq_id = str(row["id"])
        items = (await client.table("rfq_items").select("*,ingredient:canonical_ingredients(canonical_name)").eq("rfq_id", rfq_id).eq("organization_id", str(row["organization_id"])).execute()).data or []
        for item in items:
            ingredient = item.get("ingredient") if isinstance(item.get("ingredient"), dict) else {}
            item["ingredient_name"] = ingredient.get("canonical_name")
        invitations = (await client.table("supplier_invitations").select("*,vendor:vendors(name)").eq("rfq_id", rfq_id).eq("organization_id", str(row["organization_id"])).execute()).data or []
        offers_response = await client.table("rfq_offer_responses").select("*").eq("rfq_id", rfq_id).eq("organization_id", str(row["organization_id"])).order("created_at", desc=True).execute()
        offers = [await self._offer_detail(offer) for offer in offers_response.data or []]
        events = (await client.table("negotiation_events").select("*").eq("rfq_id", rfq_id).eq("organization_id", str(row["organization_id"])).order("created_at").execute()).data or []
        recommendations = (await client.table("procurement_recommendations").select("*").eq("organization_id", str(row["organization_id"])).contains("evidence", {"rfq_id": rfq_id}).limit(20).execute()).data or []
        return RfqRecord(**row, items=items, invitations=invitations, offers=offers, recommendation={"items": recommendations} if recommendations else None, negotiation_events=events)

    async def _insert_version(self, principal: ExternalPrincipal, offer: dict[str, Any], payload: OfferTermsInput, version: int, status: str, actor_type: str) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        lines = [line.model_dump(mode="json") for line in payload.line_items]
        subtotal = sum((line.quantity * line.unit_price for line in payload.line_items), Decimal("0"))
        landed = subtotal + payload.delivery_fee + payload.tax
        terms = {**payload.model_dump(mode="json"), "subtotal": str(subtotal), "landed_total": str(landed)}
        created = await client.table("rfq_offer_versions").insert({
            "offer_response_id": str(offer["id"]), "organization_id": str(principal.organization_id), "version_number": version, "status": status,
            "currency": payload.currency.upper(), "line_items": lines, "subtotal": str(subtotal), "delivery_fee": str(payload.delivery_fee), "tax": str(payload.tax),
            "landed_total": str(landed), "minimum_order_value": str(payload.minimum_order_value) if payload.minimum_order_value is not None else None,
            "payment_terms": payload.payment_terms, "delivery_date": payload.delivery_date.isoformat() if payload.delivery_date else None,
            "lead_time_days": payload.lead_time_days, "availability": payload.availability, "valid_until": payload.valid_until.isoformat() if payload.valid_until else None,
            "substitutions": payload.substitutions, "other_terms": payload.other_terms, "created_by_type": actor_type, "created_by_id": str(principal.service_client_id),
        }).execute()
        version_row = created.data[0]
        terms_hash = hashlib.sha256(json.dumps(terms, sort_keys=True, default=str).encode()).hexdigest()
        await client.table("commercial_term_snapshots").insert({"organization_id": str(principal.organization_id), "rfq_id": str(offer["rfq_id"]), "offer_response_id": str(offer["id"]), "offer_version_id": str(version_row["id"]), "terms": terms, "terms_hash": terms_hash}).execute()
        return version_row

    async def _offer_detail(self, offer: dict[str, Any]) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        versions = (await client.table("rfq_offer_versions").select("*").eq("offer_response_id", str(offer["id"])).eq("organization_id", str(offer["organization_id"])).order("version_number", desc=True).execute()).data or []
        vendor = (await client.table("vendors").select("id,name").eq("id", str(offer["vendor_id"])).eq("organization_id", str(offer["organization_id"])).limit(1).execute()).data or []
        return {**offer, "vendor_name": vendor[0].get("name") if vendor else None, "current_terms": versions[0] if versions else None, "versions": versions}

    async def _owned_offer(self, principal: ExternalPrincipal, offer_id: UUID) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        response = await client.table("rfq_offer_responses").select("*").eq("id", str(offer_id)).eq("organization_id", str(principal.organization_id)).limit(1).execute()
        if not response.data or not self._supplier_allowed(principal, UUID(str(response.data[0]["vendor_id"]))):
            raise ValueError("Offer not found")
        return response.data[0]

    def _supplier_allowed(self, principal: ExternalPrincipal, supplier_id: UUID) -> bool:
        return not principal.allowed_supplier_ids or supplier_id in principal.allowed_supplier_ids

    def _property_allowed(self, principal: ExternalPrincipal, property_id: Any) -> bool:
        return not principal.allowed_property_ids or (property_id is not None and UUID(str(property_id)) in principal.allowed_property_ids)

    def _commercial_improvement(self, offers: list[dict[str, Any]]) -> Decimal | None:
        improvements: list[Decimal] = []
        for offer in offers:
            versions = offer.get("versions") or []
            if len(versions) > 1:
                improvements.append(Decimal(str(versions[-1].get("landed_total") or 0)) - Decimal(str(versions[0].get("landed_total") or 0)))
        return sum(improvements, Decimal("0")) if improvements else None
