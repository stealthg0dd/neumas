from __future__ import annotations

from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.procurement import (
    IngredientRequirement,
    PriceIntelligenceItem,
    ProcurementAllocation,
    ProcurementRecommendation,
    ProcurementSummary,
    SupplierOffer,
    SupplierPerformance,
)


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class ProcurementOptimizerService:
    """Deterministic supplier scoring and procurement optimization."""

    def round_to_packs(self, quantity: Decimal, offer: SupplierOffer) -> tuple[Decimal, Decimal]:
        pack_qty = offer.normalized_base_quantity or offer.pack_quantity or Decimal("1")
        packs = (quantity / pack_qty).to_integral_value(rounding=ROUND_CEILING)
        rounded_qty = packs * pack_qty
        if offer.moq and rounded_qty < offer.moq:
            packs = (offer.moq / pack_qty).to_integral_value(rounding=ROUND_CEILING)
            rounded_qty = packs * pack_qty
        return rounded_qty, packs

    def score_offer(
        self,
        offer: SupplierOffer,
        performance: SupplierPerformance | None,
        *,
        required_by: date,
        budget_limit: Decimal | None = None,
        approved_only: bool = True,
    ) -> Decimal | None:
        if approved_only and not offer.approved:
            return None
        if offer.availability != "available":
            return None
        if offer.valid_from and required_by < offer.valid_from:
            return None
        if offer.valid_to and required_by > offer.valid_to:
            return None
        reliability = performance.otif if performance and performance.otif is not None else Decimal("0.75")
        fill = performance.fill_rate if performance and performance.fill_rate is not None else Decimal("0.75")
        variance = abs(performance.price_variance or Decimal("0")) if performance else Decimal("0")
        lead_penalty = Decimal(offer.lead_time_days) * Decimal("0.03")
        reliability_credit = (reliability + fill) * Decimal("0.15")
        preferred_credit = Decimal("0.05") if offer.preferred else Decimal("0")
        price = offer.contract_price if offer.contract_price is not None else offer.unit_price
        score = price + lead_penalty + variance - reliability_credit - preferred_credit
        if budget_limit is not None and price > budget_limit:
            score += Decimal("999999")
        return score

    def optimize(
        self,
        requirement: IngredientRequirement,
        offers: list[SupplierOffer],
        performance: dict[UUID, SupplierPerformance] | None = None,
        *,
        required_by: date | None = None,
        allow_split: bool = True,
        approved_only: bool = True,
        budget_limit: Decimal | None = None,
    ) -> ProcurementRecommendation:
        required_by = required_by or date.today()
        required = requirement.required_quantity
        scored: list[tuple[Decimal, SupplierOffer]] = []
        for offer in offers:
            score = self.score_offer(offer, (performance or {}).get(offer.vendor_id), required_by=required_by, budget_limit=budget_limit, approved_only=approved_only)
            if score is not None:
                scored.append((score, offer))
        scored.sort(key=lambda item: item[0])
        allocations: list[ProcurementAllocation] = []
        remaining = required
        for score, offer in scored:
            if remaining <= 0:
                break
            target = remaining if allow_split else required
            rounded_qty, packs = self.round_to_packs(target, offer)
            unit_price = offer.contract_price if offer.contract_price is not None else offer.unit_price
            subtotal = rounded_qty * unit_price
            delivery_fee = offer.delivery_fee
            if offer.free_delivery_threshold is not None and subtotal >= offer.free_delivery_threshold:
                delivery_fee = Decimal("0")
            total = money(subtotal + delivery_fee)
            allocations.append(ProcurementAllocation(
                supplier_offer_id=offer.id,
                vendor_id=offer.vendor_id,
                vendor_name=offer.vendor_name,
                quantity=rounded_qty,
                packs=packs,
                unit_price=unit_price,
                total_cost=total,
                lead_time_days=offer.lead_time_days,
                score=money(score),
            ))
            remaining = Decimal("0") if not allow_split else remaining - rounded_qty
        expected = money(sum((allocation.total_cost for allocation in allocations), Decimal("0")))
        baseline = None
        if offers:
            worst = max((offer.contract_price if offer.contract_price is not None else offer.unit_price) for offer in offers)
            baseline = money(required * worst)
        savings = money(baseline - expected) if baseline is not None else None
        confidence = Decimal("0.85") if allocations else Decimal("0")
        risk = "blocked" if not allocations else "watch" if any(a.lead_time_days > requirement.reorder_horizon_days for a in allocations) else "normal"
        return ProcurementRecommendation(
            canonical_ingredient_id=requirement.canonical_ingredient_id,
            ingredient_name=requirement.ingredient_name,
            required_quantity=required,
            selected_allocations=allocations,
            expected_cost=expected,
            baseline_cost=baseline,
            expected_savings=savings,
            tradeoffs=["pack rounding applied"] if any(a.quantity > required for a in allocations) else [],
            evidence={
                "demand_quantity": str(requirement.demand_quantity),
                "safety_stock": str(requirement.safety_stock),
                "current_inventory": str(requirement.current_inventory),
                "offers_considered": len(offers),
                "approved_only": approved_only,
            },
            confidence=confidence,
            risk=risk,
        )

    async def summary(self, tenant: TenantContext) -> ProcurementSummary:
        client = await get_async_supabase_admin()
        recs = await self._fetch_rows(client, "procurement_recommendations", "*", tenant, order_by="created_at", limit=50)
        suppliers = await self._fetch_rows(client, "vendors", "*", tenant, order_by="name", limit=100, property_scoped=False)
        offers = await self._fetch_rows(client, "supplier_item_offers", "*,ingredient:canonical_ingredients(canonical_name)", tenant, order_by="created_at", limit=500)
        return ProcurementSummary(
            recommendations=[self._row_to_recommendation(row) for row in recs],
            price_intelligence=self._price_intelligence(offers),
            suppliers=suppliers,
        )

    def _price_intelligence(self, offers: list[dict[str, Any]]) -> list[PriceIntelligenceItem]:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for offer in offers:
            grouped.setdefault(str(offer.get("canonical_ingredient_id")), []).append(offer)
        items: list[PriceIntelligenceItem] = []
        for ingredient_id, rows in grouped.items():
            prices = [Decimal(str(row.get("unit_price") or 0)) for row in rows]
            contracts = [Decimal(str(row.get("contract_price"))) for row in rows if row.get("contract_price") is not None]
            latest = prices[-1] if prices else None
            avg = sum(prices, Decimal("0")) / Decimal(len(prices)) if prices else None
            volatility = max(prices) - min(prices) if len(prices) > 1 else Decimal("0")
            switch_savings = (max(prices) - min(prices)) if len(prices) > 1 else Decimal("0")
            ingredient = rows[0].get("ingredient") if isinstance(rows[0].get("ingredient"), dict) else {}
            items.append(PriceIntelligenceItem(
                canonical_ingredient_id=UUID(ingredient_id),
                ingredient_name=str(ingredient.get("canonical_name") or "Ingredient"),
                latest_price=money(latest) if latest is not None else None,
                historical_price=money(avg) if avg is not None else None,
                contract_variance=money(latest - contracts[-1]) if latest is not None and contracts else None,
                supplier_count=len({str(row.get("vendor_id")) for row in rows}),
                price_volatility=money(volatility),
                potential_switch_savings=money(switch_savings),
            ))
        return items

    def _row_to_recommendation(self, row: dict[str, Any]) -> ProcurementRecommendation:
        return ProcurementRecommendation(
            id=UUID(str(row["id"])),
            canonical_ingredient_id=UUID(str(row["canonical_ingredient_id"])),
            ingredient_name=str(row.get("ingredient_name") or "Ingredient"),
            required_quantity=Decimal(str(row.get("required_quantity") or 0)),
            selected_allocations=[ProcurementAllocation(**allocation) for allocation in row.get("selected_allocations", [])],
            current_supplier_id=UUID(str(row["current_supplier_id"])) if row.get("current_supplier_id") else None,
            expected_cost=Decimal(str(row.get("expected_cost") or 0)),
            baseline_cost=Decimal(str(row["baseline_cost"])) if row.get("baseline_cost") is not None else None,
            expected_savings=Decimal(str(row["expected_savings"])) if row.get("expected_savings") is not None else None,
            tradeoffs=[str(item) for item in row.get("tradeoffs", [])],
            evidence=row.get("evidence") or {},
            confidence=Decimal(str(row.get("confidence") or 0)),
            risk=str(row.get("risk") or "normal"),
            status=str(row.get("status") or "recommended"),
            created_at=row.get("created_at"),
        )

    async def _fetch_rows(self, client: Any, table: str, select: str, tenant: TenantContext, *, order_by: str, limit: int, property_scoped: bool = True) -> list[dict[str, Any]]:
        query = client.table(table).select(select).eq("organization_id", str(tenant.org_id))
        if property_scoped and tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        response = await query.order(order_by).limit(limit).execute()
        return [row for row in (response.data or []) if isinstance(row, dict)]
