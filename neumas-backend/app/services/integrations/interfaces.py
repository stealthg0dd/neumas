from __future__ import annotations

from typing import Protocol

from app.api.deps import TenantContext
from app.schemas.integrations import ExternalDomainEvent, IntegrationConnectionResponse


class ExternalDomainEventHandler(Protocol):
    async def __call__(
        self,
        tenant: TenantContext,
        connection: IntegrationConnectionResponse,
        event: ExternalDomainEvent,
    ) -> dict:
        """Normalize an external event into existing Neumas domain actions."""


class IntegrationAdapter(Protocol):
    adapter_type: str
    provider_slug: str
    display_name: str

    async def health_check(
        self,
        tenant: TenantContext,
        connection: IntegrationConnectionResponse,
    ) -> dict:
        """Return health/status metadata for the connection."""

    async def normalize_event(
        self,
        tenant: TenantContext,
        connection: IntegrationConnectionResponse,
        event: ExternalDomainEvent,
    ) -> dict:
        """Convert external payloads into existing Neumas domain events only."""
