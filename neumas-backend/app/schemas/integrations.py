from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

AdapterType = Literal[
    "pos",
    "supplier",
    "accounting",
    "commerce",
    "receipt_source",
]

ConnectionStatus = Literal["connected", "needs_attention", "not_connected"]
HealthStatus = Literal["healthy", "degraded", "offline", "unknown"]


class IntegrationConnectionResponse(BaseModel):
    id: UUID | None = None
    organization_id: UUID | None = None
    property_id: UUID | None = None
    adapter_type: AdapterType
    provider_slug: str
    display_name: str
    status: ConnectionStatus
    health_status: HealthStatus
    enabled: bool = False
    implemented: bool = False
    coming_soon: bool = True
    config: dict[str, Any] = Field(default_factory=dict)
    connection_metadata: dict[str, Any] = Field(default_factory=dict)
    sync_cursor: dict[str, Any] = Field(default_factory=dict)
    error_state: dict[str, Any] = Field(default_factory=dict)
    retry_state: dict[str, Any] = Field(default_factory=dict)
    last_synced_at: datetime | None = None
    last_checked_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ExternalDomainEvent(BaseModel):
    adapter_type: AdapterType
    provider_slug: str
    event_type: str
    external_event_id: str = Field(..., min_length=1, max_length=255)
    idempotency_key: str = Field(..., min_length=8, max_length=255)
    occurred_at: datetime
    property_id: UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class IntegrationEventReceipt(BaseModel):
    integration_connection_id: UUID
    organization_id: UUID
    property_id: UUID | None = None
    external_event_id: str
    idempotency_key: str
    event_type: str
    adapter_type: AdapterType
    status: str
    error_message: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    result_summary: dict[str, Any] = Field(default_factory=dict)
    received_at: datetime | None = None
    processed_at: datetime | None = None
