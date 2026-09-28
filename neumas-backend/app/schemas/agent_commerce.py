from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

INITIAL_AGENT_COMMERCE_SCOPES = [
    "catalog:read",
    "supplier:read",
    "availability:read",
    "rfq:create",
    "rfq:read",
    "offer:read",
    "order:create",
    "order:read",
    "webhook:manage",
]


class AgentCommerceError(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    correlation_id: str | None = None


class PaginationMeta(BaseModel):
    limit: int
    offset: int
    returned: int


class AgentCommerceEnvelope(BaseModel):
    data: Any
    pagination: PaginationMeta | None = None
    request_id: str | None = None
    correlation_id: str | None = None


class ExternalPrincipal(BaseModel):
    organization_id: UUID
    service_client_id: UUID
    credential_id: UUID
    credential_prefix: str
    scopes: list[str]
    allowed_property_ids: list[UUID] = []
    allowed_supplier_ids: list[UUID] = []
    allowed_categories: list[str] = []
    spend_limit: Decimal | None = None

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes


class ServiceClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: str | None = None
    allowed_scopes: list[str] = Field(default_factory=lambda: list(INITIAL_AGENT_COMMERCE_SCOPES))
    allowed_property_ids: list[UUID] = []
    allowed_supplier_ids: list[UUID] = []
    allowed_categories: list[str] = []
    spend_limit: Decimal | None = None


class ServiceClientResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    status: str
    allowed_scopes: list[str]
    allowed_property_ids: list[UUID] = []
    allowed_supplier_ids: list[UUID] = []
    allowed_categories: list[str] = []
    spend_limit: Decimal | None = None
    created_at: datetime | str | None = None


class ApiCredentialCreate(BaseModel):
    name: str | None = None
    scopes: list[str] = Field(default_factory=lambda: list(INITIAL_AGENT_COMMERCE_SCOPES))
    expires_at: datetime | None = None


class ApiCredentialResponse(BaseModel):
    id: UUID
    service_client_id: UUID
    credential_prefix: str
    name: str | None = None
    scopes: list[str]
    expires_at: datetime | str | None = None
    last_used_at: datetime | str | None = None
    revoked_at: datetime | str | None = None
    created_at: datetime | str | None = None


class GeneratedApiCredential(ApiCredentialResponse):
    api_key: str


class SupplierExternal(BaseModel):
    id: UUID
    name: str
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    website: str | None = None
    metadata: dict[str, Any] = {}
    performance: dict[str, Any] | None = None


class CatalogItemExternal(BaseModel):
    supplier_item_id: UUID
    supplier_id: UUID | None = None
    supplier_name: str | None = None
    canonical_ingredient_id: UUID
    canonical_name: str | None = None
    supplier_sku: str | None = None
    pack_quantity: Decimal
    base_quantity: Decimal | None = None
    latest_price: Decimal | None = None
    currency: str | None = None
    availability: str | None = None


class OfferExternal(BaseModel):
    id: UUID
    supplier_id: UUID
    canonical_ingredient_id: UUID
    supplier_sku: str | None = None
    pack_quantity: Decimal
    normalized_base_quantity: Decimal
    unit_price: Decimal
    contract_price: Decimal | None = None
    currency: str
    moq: Decimal
    minimum_order_value: Decimal | None = None
    delivery_fee: Decimal
    free_delivery_threshold: Decimal | None = None
    lead_time_days: int
    order_cutoff: str | None = None
    delivery_weekdays: list[int]
    availability: str
    valid_from: str | None = None
    valid_to: str | None = None
    preferred: bool
    approved: bool


class AvailabilityExternal(BaseModel):
    offer_id: UUID
    supplier_id: UUID
    canonical_ingredient_id: UUID
    availability: str
    lead_time_days: int
    delivery_weekdays: list[int]
    order_cutoff: str | None = None
    moq: Decimal
    minimum_order_value: Decimal | None = None
