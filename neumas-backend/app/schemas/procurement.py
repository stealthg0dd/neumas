from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class IngredientRequirement(BaseModel):
    canonical_ingredient_id: UUID
    ingredient_name: str = "Ingredient"
    demand_quantity: Decimal
    safety_stock: Decimal = Decimal("0")
    current_inventory: Decimal = Decimal("0")
    on_order_quantity: Decimal = Decimal("0")
    expected_waste: Decimal = Decimal("0")
    reorder_horizon_days: int = 7

    @property
    def required_quantity(self) -> Decimal:
        return max(
            Decimal("0"),
            self.demand_quantity + self.safety_stock + self.expected_waste - self.current_inventory - self.on_order_quantity,
        )


class SupplierOffer(BaseModel):
    id: UUID
    vendor_id: UUID
    vendor_name: str = "Supplier"
    canonical_ingredient_id: UUID
    supplier_sku: str | None = None
    pack_quantity: Decimal = Decimal("1")
    normalized_base_quantity: Decimal = Decimal("1")
    unit_price: Decimal
    contract_price: Decimal | None = None
    currency: str = "USD"
    moq: Decimal = Decimal("0")
    minimum_order_value: Decimal | None = None
    delivery_fee: Decimal = Decimal("0")
    free_delivery_threshold: Decimal | None = None
    lead_time_days: int = 0
    delivery_weekdays: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    availability: str = "available"
    valid_from: date | None = None
    valid_to: date | None = None
    preferred: bool = False
    approved: bool = True


class SupplierPerformance(BaseModel):
    vendor_id: UUID
    fill_rate: Decimal | None = None
    otif: Decimal | None = None
    price_variance: Decimal | None = None
    rejection_rate: Decimal | None = None
    invoice_discrepancy_rate: Decimal | None = None
    average_lead_time_days: Decimal | None = None
    acknowledgement_time_hours: Decimal | None = None


class ProcurementAllocation(BaseModel):
    supplier_offer_id: UUID
    vendor_id: UUID
    vendor_name: str
    quantity: Decimal
    packs: Decimal
    unit_price: Decimal
    total_cost: Decimal
    lead_time_days: int
    score: Decimal


class ProcurementRecommendation(BaseModel):
    id: UUID | None = None
    canonical_ingredient_id: UUID
    ingredient_name: str
    required_quantity: Decimal
    selected_allocations: list[ProcurementAllocation]
    current_supplier_id: UUID | None = None
    expected_cost: Decimal
    baseline_cost: Decimal | None = None
    expected_savings: Decimal | None = None
    tradeoffs: list[str] = []
    evidence: dict[str, Any] = {}
    confidence: Decimal
    risk: str = "normal"
    status: str = "recommended"
    created_at: datetime | None = None


class PriceIntelligenceItem(BaseModel):
    canonical_ingredient_id: UUID
    ingredient_name: str
    latest_price: Decimal | None = None
    historical_price: Decimal | None = None
    contract_variance: Decimal | None = None
    supplier_count: int = 0
    price_volatility: Decimal | None = None
    potential_switch_savings: Decimal | None = None


class ProcurementSummary(BaseModel):
    recommendations: list[ProcurementRecommendation]
    price_intelligence: list[PriceIntelligenceItem]
    suppliers: list[dict[str, Any]]
