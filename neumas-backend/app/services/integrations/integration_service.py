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
    ProviderWebhookIngestResponse,
)
from app.services.integrations.catalog import integration_catalog
from app.services.integrations.interfaces import ExternalDomainEventHandler
from app.services.integrations.square import SquareAdapter

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
                    availability="connected" if row.get("status") == "connected" else (base.availability if base else "coming_soon"),
                    permissions=base.permissions if base else [],
                    credential_reference=row.get("credential_reference") or (base.credential_reference if base else None),
                    oauth_state=row.get("oauth_state"),
                    token_expires_at=row.get("token_expires_at"),
                    webhook_subscriptions=row.get("webhook_subscriptions") or [],
                    last_successful_sync_at=row.get("last_successful_sync_at") or row.get("last_synced_at"),
                    last_error_at=row.get("last_error_at"),
                    records_synced=int(row.get("records_synced") or 0),
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

    async def connection_status(self, tenant: TenantContext) -> dict[str, Any]:
        connections = await self.list_connections(tenant)
        return {
            "connected": sum(1 for item in connections if item.availability == "connected"),
            "available": sum(1 for item in connections if item.availability == "available"),
            "requires_partner_access": sum(1 for item in connections if item.availability == "requires_partner_access"),
            "coming_soon": sum(1 for item in connections if item.availability == "coming_soon"),
            "connections": connections,
        }

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

    async def ingest_square_webhook(
        self,
        tenant: TenantContext,
        *,
        body: bytes,
        payload: dict[str, Any],
        signature_header: str | None,
        notification_url: str,
    ) -> ProviderWebhookIngestResponse:
        square = SquareAdapter()
        if not square.enabled or not square.webhook_enabled:
            return ProviderWebhookIngestResponse(status="disabled", canonical_result={"reason": "square_credentials_unavailable"})
        if not square.verify_webhook_signature(notification_url=notification_url, body=body, signature_header=signature_header):
            return ProviderWebhookIngestResponse(status="invalid_signature")

        connection = await self.get_connection(tenant, "pos", "square")
        if connection is None:
            return ProviderWebhookIngestResponse(status="not_connected")

        external_event_id = str(payload.get("event_id") or payload.get("merchant_id") or payload.get("created_at") or "")
        if not external_event_id:
            return ProviderWebhookIngestResponse(status="invalid_payload", canonical_result={"reason": "missing_event_id"})
        raw = await self.record_raw_event(
            tenant,
            connection,
            provider_slug="square",
            event_type=str(payload.get("type") or "square.webhook"),
            external_event_id=external_event_id,
            idempotency_key=f"square:{external_event_id}",
            payload=payload,
            headers={"x-square-signature": "present"},
        )
        if raw.get("duplicate"):
            return ProviderWebhookIngestResponse(status="duplicate", duplicate=True, raw_event_id=raw.get("id"))
        orders = square.map_webhook_payload_to_orders(payload)
        canonical_rows = [row for order in orders for row in square.map_order_to_sales_rows(order)]
        result = {"sales_rows": len(canonical_rows), "mapping": "square_order_to_canonical_sales"}
        await self.mark_raw_event_mapped(raw.get("id"), result)
        return ProviderWebhookIngestResponse(status="processed", raw_event_id=raw.get("id"), canonical_result=result)

    async def record_raw_event(
        self,
        tenant: TenantContext,
        connection: IntegrationConnectionResponse,
        *,
        provider_slug: str,
        event_type: str,
        external_event_id: str,
        idempotency_key: str,
        payload: dict[str, Any],
        headers: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        if client is None or connection.id is None:
            return {"status": "skipped", "duplicate": False}
        existing = await (
            client.table("raw_provider_events")
            .select("id,external_event_id,mapping_status")
            .eq("integration_connection_id", str(connection.id))
            .eq("external_event_id", external_event_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            row = existing.data[0]
            row["duplicate"] = True
            return row
        event = {
            "integration_connection_id": str(connection.id),
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "provider_slug": provider_slug,
            "adapter_type": connection.adapter_type,
            "external_event_id": external_event_id,
            "event_type": event_type,
            "idempotency_key": idempotency_key,
            "payload": payload,
            "headers": headers or {},
            "mapping_status": "received",
        }
        resp = await client.table("raw_provider_events").insert(event).execute()
        row = resp.data[0] if resp.data else event
        row["duplicate"] = False
        return row

    async def mark_raw_event_mapped(self, raw_event_id: UUID | str | None, canonical_result: dict[str, Any]) -> None:
        if raw_event_id is None:
            return
        client = await get_async_supabase_admin()
        if client is None:
            return
        await (
            client.table("raw_provider_events")
            .update({"mapping_status": "mapped", "canonical_result": canonical_result})
            .eq("id", str(raw_event_id))
            .execute()
        )
