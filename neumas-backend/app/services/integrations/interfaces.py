from __future__ import annotations

from typing import Any, Protocol

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


class SalesConnector(Protocol):
    async def list_locations(self) -> list[dict[str, Any]]: ...
    async def fetch_sales(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...
    def map_sale_to_canonical(self, payload: dict[str, Any]) -> list[dict[str, str]]: ...


class CatalogConnector(Protocol):
    async def fetch_catalog(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...


class InventoryConnector(Protocol):
    async def fetch_inventory(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...


class AccountingConnector(Protocol):
    async def fetch_contacts(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...
    async def fetch_bills(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...


class SupplierConnector(Protocol):
    async def fetch_supplier_items(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...


class ReservationConnector(Protocol):
    async def fetch_reservations(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...


class PMSConnector(Protocol):
    async def fetch_occupancy(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...


class DemandSignalConnector(Protocol):
    async def fetch_signals(self, *, cursor: str | None = None) -> tuple[list[dict[str, Any]], str | None]: ...
