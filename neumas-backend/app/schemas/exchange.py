from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

RfqStatus = Literal["DRAFT", "OPEN", "QUOTING", "NEGOTIATING", "SELECTED", "CANCELLED", "EXPIRED", "CLOSED"]
OfferStatus = Literal["SUBMITTED", "COUNTERED", "ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"]
NegotiationEventType = Literal["PRICE_CHANGE", "QUANTITY_CHANGE", "DELIVERY_CHANGE", "SUBSTITUTION", "PAYMENT_TERM_CHANGE", "OTHER_TERM_CHANGE"]


class RfqItemInput(BaseModel):
    canonical_ingredient_id: UUID
    quantity: Decimal = Field(gt=0)
    uom_id: UUID | None = None
    normalized_base_quantity: Decimal = Field(gt=0)
    specifications: dict[str, Any] = Field(default_factory=dict)


class RfqCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    property_id: UUID | None = None
    currency: str = Field(default="USD", min_length=3, max_length=3)
    required_by: date | None = None
    response_deadline: datetime | None = None
    notes: str | None = None
    items: list[RfqItemInput] = Field(min_length=1)
    supplier_ids: list[UUID] = Field(min_length=1)


class OfferLineInput(BaseModel):
    rfq_item_id: UUID
    canonical_ingredient_id: UUID
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    pack_quantity: Decimal = Field(default=Decimal("1"), gt=0)
    normalized_base_quantity: Decimal = Field(default=Decimal("1"), gt=0)
    moq: Decimal = Field(default=Decimal("0"), ge=0)
    availability: str = "available"
    substitution_ingredient_id: UUID | None = None


class OfferTermsInput(BaseModel):
    vendor_id: UUID
    currency: str = Field(default="USD", min_length=3, max_length=3)
    line_items: list[OfferLineInput] = Field(min_length=1)
    delivery_fee: Decimal = Field(default=Decimal("0"), ge=0)
    tax: Decimal = Field(default=Decimal("0"), ge=0)
    minimum_order_value: Decimal | None = Field(default=None, ge=0)
    payment_terms: str | None = None
    delivery_date: date | None = None
    lead_time_days: int = Field(default=0, ge=0)
    availability: str = "available"
    valid_until: datetime | None = None
    substitutions: list[dict[str, Any]] = Field(default_factory=list)
    other_terms: dict[str, Any] = Field(default_factory=dict)


class CounterOfferInput(OfferTermsInput):
    event_types: list[NegotiationEventType] = Field(min_length=1)


class RfqRecord(BaseModel):
    id: UUID
    title: str
    status: RfqStatus
    currency: str
    property_id: UUID | None = None
    required_by: date | None = None
    response_deadline: datetime | None = None
    notes: str | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    invitations: list[dict[str, Any]] = Field(default_factory=list)
    offers: list[dict[str, Any]] = Field(default_factory=list)
    recommendation: dict[str, Any] | None = None
    negotiation_events: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime | None = None


class ExchangeSummary(BaseModel):
    rfq_value: Decimal | None = None
    active_rfqs: int
    offers_received: int
    orders_created: int
    commercial_improvement: Decimal | None = None
    active_buyer_agents: int
    active_suppliers: int
    rfqs: list[RfqRecord]
    recent_offers: list[dict[str, Any]]
    negotiations_requiring_action: list[dict[str, Any]]
    policy_approvals: list[dict[str, Any]]
    orders_in_flight: list[dict[str, Any]]
    network_activity: list[dict[str, Any]]
