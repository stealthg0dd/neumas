from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.procurement import (
    IngredientRequirement,
    SupplierOffer,
    SupplierPerformance,
)
from app.services.procurement_optimizer_service import ProcurementOptimizerService


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(user_id=uuid4(), org_id=uuid4(), property_id=uuid4(), role="admin", jwt="test")


def offer(**kwargs) -> SupplierOffer:
    return SupplierOffer(
        id=kwargs.get("id", uuid4()),
        vendor_id=kwargs.get("vendor_id", uuid4()),
        vendor_name=kwargs.get("vendor_name", "Supplier"),
        canonical_ingredient_id=kwargs.get("canonical_ingredient_id", uuid4()),
        normalized_base_quantity=Decimal(str(kwargs.get("pack", "5"))),
        pack_quantity=Decimal(str(kwargs.get("pack", "5"))),
        unit_price=Decimal(str(kwargs.get("price", "10"))),
        moq=Decimal(str(kwargs.get("moq", "0"))),
        delivery_fee=Decimal(str(kwargs.get("delivery_fee", "0"))),
        lead_time_days=kwargs.get("lead", 1),
        approved=kwargs.get("approved", True),
        availability=kwargs.get("availability", "available"),
        preferred=kwargs.get("preferred", False),
    )


def req(ingredient_id=None, qty="12") -> IngredientRequirement:
    return IngredientRequirement(canonical_ingredient_id=ingredient_id or uuid4(), ingredient_name="Chicken", demand_quantity=Decimal(qty), safety_stock=Decimal("2"), current_inventory=Decimal("4"))


def test_moq_and_pack_rounding():
    service = ProcurementOptimizerService()
    selected = offer(pack="5", moq="20")
    rounded, packs = service.round_to_packs(Decimal("11"), selected)
    assert rounded == Decimal("20")
    assert packs == Decimal("4")


def test_lead_time_affects_risk():
    ingredient_id = uuid4()
    result = ProcurementOptimizerService().optimize(req(ingredient_id), [offer(canonical_ingredient_id=ingredient_id, lead=10)], required_by=date.today())
    assert result.risk == "watch"


def test_split_supplier_allocation():
    ingredient_id = uuid4()
    result = ProcurementOptimizerService().optimize(req(ingredient_id, "20"), [
        offer(canonical_ingredient_id=ingredient_id, vendor_name="A", price="1", pack="10"),
        offer(canonical_ingredient_id=ingredient_id, vendor_name="B", price="2", pack="10"),
    ], allow_split=True)
    assert result.selected_allocations
    assert result.expected_cost <= result.baseline_cost


def test_approved_supplier_restriction_blocks_unapproved():
    ingredient_id = uuid4()
    result = ProcurementOptimizerService().optimize(req(ingredient_id), [offer(canonical_ingredient_id=ingredient_id, approved=False)], approved_only=True)
    assert result.selected_allocations == []
    assert result.risk == "blocked"


def test_cost_comparison_and_savings():
    ingredient_id = uuid4()
    result = ProcurementOptimizerService().optimize(req(ingredient_id, "10"), [
        offer(canonical_ingredient_id=ingredient_id, price="3", pack="1"),
        offer(canonical_ingredient_id=ingredient_id, price="5", pack="1"),
    ])
    assert result.expected_savings is not None
    assert result.expected_savings > 0


def test_supplier_performance_weighting_can_select_reliable_supplier():
    ingredient_id = uuid4()
    vendor_good = uuid4()
    vendor_bad = uuid4()
    good = offer(canonical_ingredient_id=ingredient_id, vendor_id=vendor_good, vendor_name="Reliable", price="10")
    bad = offer(canonical_ingredient_id=ingredient_id, vendor_id=vendor_bad, vendor_name="Risky", price="10.01")
    result = ProcurementOptimizerService().optimize(
        req(ingredient_id),
        [bad, good],
        performance={
            vendor_good: SupplierPerformance(vendor_id=vendor_good, otif=Decimal("0.98"), fill_rate=Decimal("0.99")),
            vendor_bad: SupplierPerformance(vendor_id=vendor_bad, otif=Decimal("0.30"), fill_rate=Decimal("0.40")),
        },
    )
    assert result.selected_allocations[0].vendor_name == "Reliable"


@pytest.mark.asyncio
async def test_procurement_summary_tenant_isolation(monkeypatch, tenant: TenantContext):
    filters = {}

    class Resp:
        data = []

    class Query:
        def __init__(self, table):
            self.table = table
            filters.setdefault(table, [])

        def select(self, *_args):
            return self

        def eq(self, key, value):
            filters[self.table].append((key, value))
            return self

        def order(self, *_args):
            return self

        def limit(self, *_args):
            return self

        async def execute(self):
            return Resp()

    class Client:
        def table(self, table):
            return Query(table)

    monkeypatch.setattr("app.services.procurement_optimizer_service.get_async_supabase_admin", AsyncMock(return_value=Client()))
    await ProcurementOptimizerService().summary(tenant)
    assert ("organization_id", str(tenant.org_id)) in filters["procurement_recommendations"]
    assert ("property_id", str(tenant.property_id)) in filters["procurement_recommendations"]
