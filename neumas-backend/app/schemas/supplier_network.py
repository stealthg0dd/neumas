"""Supplier network / portal schemas (vendor-backed, org-scoped)."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

OnboardingStep = Literal[
    "profile",
    "service_areas",
    "catalog",
    "pricing",
    "availability",
    "moq_pack",
    "delivery",
    "commercial_terms",
    "activate",
    "complete",
]

SupplierAccountStatus = Literal[
    "draft", "onboarding", "agent_ready", "active", "suspended"
]


class SupplierAccountCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    contact_email: str | None = None
    contact_phone: str | None = None
    vendor_id: UUID | None = None


class SupplierAccountUpdate(BaseModel):
    display_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    onboarding_step: OnboardingStep | None = None
    status: SupplierAccountStatus | None = None
    agent_endpoint_enabled: bool | None = None
    metadata: dict[str, Any] | None = None


class SupplierAccount(BaseModel):
    id: UUID
    organization_id: UUID
    vendor_id: UUID
    display_name: str
    contact_email: str | None = None
    contact_phone: str | None = None
    status: SupplierAccountStatus
    onboarding_step: OnboardingStep
    agent_endpoint_enabled: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SupplierLocationCreate(BaseModel):
    name: str
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    region: str | None = None
    postal_code: str | None = None
    country: str = "SG"
    is_primary: bool = False


class SupplierLocation(SupplierLocationCreate):
    id: UUID
    organization_id: UUID
    vendor_id: UUID
    is_active: bool = True


class SupplierServiceAreaCreate(BaseModel):
    name: str
    area_type: Literal["postal_code", "city", "region", "radius", "custom"] = "postal_code"
    area_value: str
    radius_km: Decimal | None = None
    location_id: UUID | None = None


class SupplierServiceArea(SupplierServiceAreaCreate):
    id: UUID
    organization_id: UUID
    vendor_id: UUID
    is_active: bool = True


class SupplierDeliverySlotCreate(BaseModel):
    weekday: int = Field(ge=0, le=6)
    window_start: time
    window_end: time
    cutoff_hours: int = 24
    capacity: int | None = None
    service_area_id: UUID | None = None


class SupplierDeliverySlot(SupplierDeliverySlotCreate):
    id: UUID
    organization_id: UUID
    vendor_id: UUID
    is_active: bool = True


class SupplierAvailabilityUpsert(BaseModel):
    supplier_item_id: UUID | None = None
    status: Literal["available", "limited", "unavailable", "seasonal"] = "available"
    quantity_available: Decimal | None = None
    available_from: date | None = None
    available_until: date | None = None
    lead_time_days: int = 0
    notes: str | None = None


class SupplierAvailability(SupplierAvailabilityUpsert):
    id: UUID
    organization_id: UUID
    vendor_id: UUID


class SupplierCommercialTermsUpsert(BaseModel):
    currency: str = "SGD"
    payment_terms: str | None = None
    minimum_order_value: Decimal | None = None
    default_lead_time_days: int = 1
    delivery_fee: Decimal = Decimal("0")
    free_delivery_threshold: Decimal | None = None
    pack_rules: dict[str, Any] = Field(default_factory=dict)
    moq_rules: dict[str, Any] = Field(default_factory=dict)
    other_terms: dict[str, Any] = Field(default_factory=dict)
    effective_from: date | None = None
    effective_until: date | None = None
    is_active: bool = True


class SupplierCommercialTerms(SupplierCommercialTermsUpsert):
    id: UUID
    organization_id: UUID
    vendor_id: UUID


class SupplierCapabilityUpsert(BaseModel):
    capability: Literal[
        "csv_import",
        "manual_ui",
        "rest_api",
        "webhook",
        "cold_chain",
        "same_day",
        "scheduled_delivery",
        "agent_endpoint",
    ]
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class SupplierCapability(SupplierCapabilityUpsert):
    id: UUID
    organization_id: UUID
    vendor_id: UUID


class SupplierCatalogImportRequest(BaseModel):
    """CSV or JSON catalog rows for initial import (no EDI/cXML/SFTP)."""

    format: Literal["csv", "json"] = "csv"
    csv_text: str | None = None
    rows: list[dict[str, Any]] = Field(default_factory=list)


class SupplierCatalogImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str] = Field(default_factory=list)


class SupplierWebhookIngest(BaseModel):
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class SupplierHomepageMetrics(BaseModel):
    open_rfq_value: Decimal | None = None
    rfqs_requiring_response: int = 0
    offers_submitted: int = 0
    orders_won: int = 0
    agent_sourced_revenue: Decimal | None = None
    catalog_readiness_pct: Decimal = Decimal("0")
    fill_rate: Decimal | None = None


class SupplierWorkspaceSummary(BaseModel):
    account: SupplierAccount | None = None
    metrics: SupplierHomepageMetrics
    locations: list[SupplierLocation] = Field(default_factory=list)
    service_areas: list[SupplierServiceArea] = Field(default_factory=list)
    delivery_slots: list[SupplierDeliverySlot] = Field(default_factory=list)
    capabilities: list[SupplierCapability] = Field(default_factory=list)
    commercial_terms: SupplierCommercialTerms | None = None
    onboarding_complete: bool = False
