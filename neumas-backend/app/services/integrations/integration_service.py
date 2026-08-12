from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.audit_logs import AuditLogsRepository
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.integrations import (
    ExternalDomainEvent,
    IntegrationConnectionResponse,
)
from app.services.integrations.catalog import integration_catalog
from app.services.integrations.interfaces import ExternalDomainEventHandler

logger = get_logger(__name__)


class IntegrationService:
    """Adapter foundation layer with strict domain boundaries."""

    def __init__(self) -> None:
        self._audit_repo = AuditLogsRepository()

    async def list_connections(self, tenant: TenantContext) -> list[IntegrationConnectionResponse]:
        client = await get_async_supabase_admin()
        rows: list[dict[str, Any]] = []
        if client is not None:
            resp = await (
                client.table("integration_connections")
                .select("*")
                .eq("organization_id", str(tenant.org_id))
                .order("display_name")
                .execute()
            )
            rows = resp.data or []

        catalog = {
            (entry.adapter_type, entry.provider_slug): entry
            for entry in integration_catalog()
        }
        merged: list[IntegrationConnectionResponse] = []
        seen: set[tuple[str, str]] = set()

        for row in rows:
            key = (str(row.get("adapter_type")), str(row.get("provider_slug")))
            base = catalog.get(key)
            merged.append(
                IntegrationConnectionResponse(
                    id=UUID(str(row["id"])) if row.get("id") else None,
                    organization_id=UUID(str(row["organization_id"])) if row.get("organization_id") else None,
                    property_id=UUID(str(row["property_id"])) if row.get("property_id") else None,
                    adapter_type=key[0],  # type: ignore[arg-type]
                    provider_slug=key[1],
                    display_name=str(row.get("display_name") or base.display_name if base else key[1]),
                    status=str(row.get("status") or "not_connected"),  # type: ignore[arg-type]
                    health_status=str(row.get("health_status") or "unknown"),  # type: ignore[arg-type]
                    enabled=bool(row.get("enabled") or False),
                    implemented=bool(base.implemented) if base else False,
                    coming_soon=bool(base.coming_soon) if base else False,
                    config=row.get("config") or {},
                    connection_metadata=row.get("connection_metadata") or {},
                    sync_cursor=row.get("sync_cursor") or {},
                    error_state=row.get("error_state") or {},
                    retry_state=row.get("retry_state") or {},
                    last_synced_at=row.get("last_synced_at"),
                    last_checked_at=row.get("last_checked_at"),
                    created_at=row.get("created_at"),
                    updated_at=row.get("updated_at"),
                )
            )
            seen.add(key)

        for key, entry in catalog.items():
            if key not in seen:
                merged.append(
                    entry.model_copy(
                        update={
                            "organization_id": tenant.org_id,
                            "property_id": tenant.property_id,
                        }
                    )
                )

        merged.sort(key=lambda item: (item.adapter_type, item.display_name.lower()))
        return merged

    async def get_connection(
        self,
        tenant: TenantContext,
        adapter_type: str,
        provider_slug: str,
    ) -> IntegrationConnectionResponse | None:
        connections = await self.list_connections(tenant)
        for connection in connections:
            if (
                connection.adapter_type == adapter_type
                and connection.provider_slug == provider_slug
            ):
                return connection
        return None

    async def record_event_receipt(
        self,
        tenant: TenantContext,
        connection: IntegrationConnectionResponse,
        event: ExternalDomainEvent,
        *,
        status: str,
        result_summary: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        if client is None or connection.id is None or connection.organization_id is None:
            return {
                "status": status,
                "external_event_id": event.external_event_id,
                "skipped": True,
            }

        existing = await (
            client.table("integration_event_receipts")
            .select("*")
            .eq("integration_connection_id", str(connection.id))
            .eq("external_event_id", event.external_event_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]

        payload = {
            "integration_connection_id": str(connection.id),
            "organization_id": str(connection.organization_id),
            "property_id": str(event.property_id or connection.property_id) if (event.property_id or connection.property_id) else None,
            "external_event_id": event.external_event_id,
            "idempotency_key": event.idempotency_key,
            "event_type": event.event_type,
            "adapter_type": event.adapter_type,
            "status": status,
            "error_message": error_message,
            "payload": event.payload,
            "result_summary": result_summary or {},
            "processed_at": datetime.now(UTC).isoformat(),
        }
        resp = await client.table("integration_event_receipts").insert(payload).execute()
        await self._audit_repo.log(
            tenant=tenant,
            action="integration.event_recorded",
            resource_type="integration_connections",
            resource_id=connection.id,
            metadata={
                "provider_slug": connection.provider_slug,
                "adapter_type": event.adapter_type,
                "external_event_id": event.external_event_id,
                "status": status,
                "error_message": error_message,
            },
        )
        return resp.data[0] if resp.data else payload

    async def ingest_event(
        self,
        tenant: TenantContext,
        connection: IntegrationConnectionResponse,
        event: ExternalDomainEvent,
        handler: ExternalDomainEventHandler,
    ) -> dict[str, Any]:
        if event.adapter_type != connection.adapter_type:
            raise ValueError("Adapter type mismatch")
        if connection.organization_id and connection.organization_id != tenant.org_id:
            raise PermissionError("Integration connection does not belong to tenant")
        if (
            event.property_id
            and connection.property_id
            and event.property_id != connection.property_id
        ):
            raise PermissionError("Integration event property mismatch")
        if not connection.implemented:
            raise ValueError("Integration provider is not implemented")

        try:
            result = await handler(tenant, connection, event)
        except Exception as exc:
            await self.record_event_receipt(
                tenant,
                connection,
                event,
                status="failed",
                error_message=str(exc),
            )
            raise

        await self.record_event_receipt(
            tenant,
            connection,
            event,
            status="processed",
            result_summary=result,
        )
        return result
