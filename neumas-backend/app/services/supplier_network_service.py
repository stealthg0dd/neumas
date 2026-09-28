"""Supplier network service — vendor-backed, org-scoped portal operations."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.supplier_network import (
    SupplierAccount,
    SupplierAccountCreate,
    SupplierAccountUpdate,
    SupplierAvailability,
    SupplierAvailabilityUpsert,
    SupplierCapability,
    SupplierCapabilityUpsert,
    SupplierCatalogImportRequest,
    SupplierCatalogImportResult,
    SupplierCommercialTerms,
    SupplierCommercialTermsUpsert,
    SupplierDeliverySlot,
    SupplierDeliverySlotCreate,
    SupplierHomepageMetrics,
    SupplierLocation,
    SupplierLocationCreate,
    SupplierServiceArea,
    SupplierServiceAreaCreate,
    SupplierWebhookIngest,
    SupplierWorkspaceSummary,
)

logger = get_logger(__name__)


class SupplierNetworkError(Exception):
    def __init__(self, message: str, *, code: str = "supplier_error") -> None:
        super().__init__(message)
        self.code = code


def _parse_csv(text: str) -> list[dict[str, str]]:
    import csv
    from io import StringIO

    reader = csv.DictReader(StringIO(text))
    return [dict(row) for row in reader if any((v or "").strip() for v in row.values())]


class SupplierNetworkService:
    """Org-scoped supplier portal operations. Suppliers only see their own vendor data."""

    async def _client(self):
        client = await get_async_supabase_admin()
        if client is None:
            raise SupplierNetworkError("Supabase unavailable", code="supabase_unavailable")
        return client

    def _org_filter(self, query, tenant: TenantContext):
        return query.eq("organization_id", str(tenant.org_id))

    async def _require_account(
        self, tenant: TenantContext, vendor_id: UUID | None = None
    ) -> dict[str, Any]:
        client = await self._client()
        query = (
            client.table("supplier_accounts")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
        )
        if vendor_id:
            query = query.eq("vendor_id", str(vendor_id))
        resp = await query.limit(1).execute()
        rows = resp.data or []
        if not rows:
            raise SupplierNetworkError("Supplier account not found", code="not_found")
        return rows[0]

    async def create_account(
        self, tenant: TenantContext, payload: SupplierAccountCreate
    ) -> SupplierAccount:
        client = await self._client()
        vendor_id = payload.vendor_id
        if vendor_id is None:
            vendor_resp = await (
                client.table("vendors")
                .insert(
                    {
                        "organization_id": str(tenant.org_id),
                        "name": payload.display_name,
                        "normalized_name": payload.display_name.strip().lower(),
                        "is_active": True,
                        "network_status": "onboarding",
                        "onboarding_step": "profile",
                        "metadata": {"source": "supplier_portal"},
                    }
                )
                .execute()
            )
            vendor = (vendor_resp.data or [None])[0]
            if not vendor:
                raise SupplierNetworkError("Failed to create vendor identity")
            vendor_id = UUID(str(vendor["id"]))
        else:
            vendor_check = await (
                client.table("vendors")
                .select("id")
                .eq("id", str(vendor_id))
                .eq("organization_id", str(tenant.org_id))
                .limit(1)
                .execute()
            )
            if not (vendor_check.data or []):
                raise SupplierNetworkError("Vendor not in organization", code="forbidden")

        row = {
            "organization_id": str(tenant.org_id),
            "vendor_id": str(vendor_id),
            "display_name": payload.display_name,
            "contact_email": payload.contact_email,
            "contact_phone": payload.contact_phone,
            "status": "onboarding",
            "onboarding_step": "profile",
            "agent_endpoint_enabled": False,
            "created_by_id": str(tenant.user_id) if tenant.user_id else None,
            "metadata": {},
        }
        resp = await client.table("supplier_accounts").insert(row).execute()
        created = (resp.data or [None])[0]
        if not created:
            raise SupplierNetworkError("Failed to create supplier account")

        # Seed supported onboarding channels (CSV / manual / REST / webhook).
        for capability in ("csv_import", "manual_ui", "rest_api", "webhook"):
            await (
                client.table("supplier_capabilities")
                .insert(
                    {
                        "organization_id": str(tenant.org_id),
                        "vendor_id": str(vendor_id),
                        "capability": capability,
                        "enabled": True,
                        "config": {},
                    }
                )
                .execute()
            )

        return SupplierAccount.model_validate(created)

    async def get_account(self, tenant: TenantContext) -> SupplierAccount | None:
        client = await self._client()
        resp = await (
            client.table("supplier_accounts")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return SupplierAccount.model_validate(rows[0]) if rows else None

    async def update_account(
        self, tenant: TenantContext, payload: SupplierAccountUpdate
    ) -> SupplierAccount:
        account = await self._require_account(tenant)
        updates = payload.model_dump(exclude_none=True)
        if not updates:
            return SupplierAccount.model_validate(account)
        client = await self._client()
        resp = await (
            client.table("supplier_accounts")
            .update(updates)
            .eq("id", account["id"])
            .eq("organization_id", str(tenant.org_id))
            .execute()
        )
        updated = (resp.data or [None])[0] or {**account, **updates}
        vendor_updates: dict[str, Any] = {}
        if "status" in updates:
            vendor_updates["network_status"] = updates["status"]
        if "onboarding_step" in updates:
            vendor_updates["onboarding_step"] = updates["onboarding_step"]
        if "agent_endpoint_enabled" in updates:
            vendor_updates["agent_endpoint_enabled"] = updates["agent_endpoint_enabled"]
        if vendor_updates:
            await (
                client.table("vendors")
                .update(vendor_updates)
                .eq("id", account["vendor_id"])
                .eq("organization_id", str(tenant.org_id))
                .execute()
            )
        return SupplierAccount.model_validate(updated)

    async def activate_agent_endpoint(self, tenant: TenantContext) -> SupplierAccount:
        account = await self.update_account(
            tenant,
            SupplierAccountUpdate(
                status="agent_ready",
                onboarding_step="complete",
                agent_endpoint_enabled=True,
            ),
        )
        client = await self._client()
        await (
            client.table("supplier_capabilities")
            .upsert(
                {
                    "organization_id": str(tenant.org_id),
                    "vendor_id": str(account.vendor_id),
                    "capability": "agent_endpoint",
                    "enabled": True,
                    "config": {"activated": True},
                },
                on_conflict="vendor_id,capability",
            )
            .execute()
        )
        return account

    async def add_location(
        self, tenant: TenantContext, payload: SupplierLocationCreate
    ) -> SupplierLocation:
        account = await self._require_account(tenant)
        client = await self._client()
        row = {
            **payload.model_dump(),
            "organization_id": str(tenant.org_id),
            "vendor_id": account["vendor_id"],
            "is_active": True,
        }
        resp = await client.table("supplier_locations").insert(row).execute()
        return SupplierLocation.model_validate((resp.data or [row])[0])

    async def list_locations(self, tenant: TenantContext) -> list[SupplierLocation]:
        account = await self.get_account(tenant)
        if not account:
            return []
        client = await self._client()
        resp = await (
            client.table("supplier_locations")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(account.vendor_id))
            .execute()
        )
        return [SupplierLocation.model_validate(r) for r in (resp.data or [])]

    async def add_service_area(
        self, tenant: TenantContext, payload: SupplierServiceAreaCreate
    ) -> SupplierServiceArea:
        account = await self._require_account(tenant)
        client = await self._client()
        row = {
            **payload.model_dump(mode="json"),
            "organization_id": str(tenant.org_id),
            "vendor_id": account["vendor_id"],
            "is_active": True,
        }
        if row.get("location_id"):
            row["location_id"] = str(row["location_id"])
        resp = await client.table("supplier_service_areas").insert(row).execute()
        return SupplierServiceArea.model_validate((resp.data or [row])[0])

    async def list_service_areas(self, tenant: TenantContext) -> list[SupplierServiceArea]:
        account = await self.get_account(tenant)
        if not account:
            return []
        client = await self._client()
        resp = await (
            client.table("supplier_service_areas")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(account.vendor_id))
            .execute()
        )
        return [SupplierServiceArea.model_validate(r) for r in (resp.data or [])]

    async def add_delivery_slot(
        self, tenant: TenantContext, payload: SupplierDeliverySlotCreate
    ) -> SupplierDeliverySlot:
        account = await self._require_account(tenant)
        client = await self._client()
        row = {
            **payload.model_dump(mode="json"),
            "organization_id": str(tenant.org_id),
            "vendor_id": account["vendor_id"],
            "is_active": True,
        }
        if row.get("service_area_id"):
            row["service_area_id"] = str(row["service_area_id"])
        resp = await client.table("supplier_delivery_slots").insert(row).execute()
        return SupplierDeliverySlot.model_validate((resp.data or [row])[0])

    async def list_delivery_slots(self, tenant: TenantContext) -> list[SupplierDeliverySlot]:
        account = await self.get_account(tenant)
        if not account:
            return []
        client = await self._client()
        resp = await (
            client.table("supplier_delivery_slots")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(account.vendor_id))
            .execute()
        )
        return [SupplierDeliverySlot.model_validate(r) for r in (resp.data or [])]

    async def upsert_availability(
        self, tenant: TenantContext, payload: SupplierAvailabilityUpsert
    ) -> SupplierAvailability:
        account = await self._require_account(tenant)
        client = await self._client()
        row = {
            **payload.model_dump(mode="json"),
            "organization_id": str(tenant.org_id),
            "vendor_id": account["vendor_id"],
            "id": str(uuid4()),
        }
        if row.get("supplier_item_id"):
            row["supplier_item_id"] = str(row["supplier_item_id"])
        resp = await client.table("supplier_availability").insert(row).execute()
        return SupplierAvailability.model_validate((resp.data or [row])[0])

    async def list_availability(self, tenant: TenantContext) -> list[SupplierAvailability]:
        account = await self.get_account(tenant)
        if not account:
            return []
        client = await self._client()
        resp = await (
            client.table("supplier_availability")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(account.vendor_id))
            .execute()
        )
        return [SupplierAvailability.model_validate(r) for r in (resp.data or [])]

    async def upsert_commercial_terms(
        self, tenant: TenantContext, payload: SupplierCommercialTermsUpsert
    ) -> SupplierCommercialTerms:
        account = await self._require_account(tenant)
        client = await self._client()
        row = {
            **payload.model_dump(mode="json"),
            "organization_id": str(tenant.org_id),
            "vendor_id": account["vendor_id"],
        }
        resp = await client.table("supplier_commercial_terms").insert(row).execute()
        return SupplierCommercialTerms.model_validate((resp.data or [row])[0])

    async def get_commercial_terms(
        self, tenant: TenantContext
    ) -> SupplierCommercialTerms | None:
        account = await self.get_account(tenant)
        if not account:
            return None
        client = await self._client()
        resp = await (
            client.table("supplier_commercial_terms")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(account.vendor_id))
            .eq("is_active", True)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return SupplierCommercialTerms.model_validate(rows[0]) if rows else None

    async def upsert_capability(
        self, tenant: TenantContext, payload: SupplierCapabilityUpsert
    ) -> SupplierCapability:
        account = await self._require_account(tenant)
        client = await self._client()
        row = {
            **payload.model_dump(),
            "organization_id": str(tenant.org_id),
            "vendor_id": account["vendor_id"],
        }
        resp = await (
            client.table("supplier_capabilities")
            .upsert(row, on_conflict="vendor_id,capability")
            .execute()
        )
        return SupplierCapability.model_validate((resp.data or [row])[0])

    async def list_capabilities(self, tenant: TenantContext) -> list[SupplierCapability]:
        account = await self.get_account(tenant)
        if not account:
            return []
        client = await self._client()
        resp = await (
            client.table("supplier_capabilities")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(account.vendor_id))
            .execute()
        )
        return [SupplierCapability.model_validate(r) for r in (resp.data or [])]

    async def import_catalog(
        self, tenant: TenantContext, payload: SupplierCatalogImportRequest
    ) -> SupplierCatalogImportResult:
        account = await self._require_account(tenant)
        rows = payload.rows
        errors: list[str] = []
        if payload.format == "csv":
            if not payload.csv_text:
                raise SupplierNetworkError("csv_text required for CSV import")
            try:
                rows = _parse_csv(payload.csv_text)
            except Exception as exc:  # noqa: BLE001
                raise SupplierNetworkError(f"Invalid CSV: {exc}") from exc

        client = await self._client()
        imported = 0
        skipped = 0
        for index, row in enumerate(rows):
            name = str(row.get("name") or row.get("item_name") or "").strip()
            if not name:
                skipped += 1
                errors.append(f"row {index + 1}: missing name")
                continue
            try:
                await (
                    client.table("supplier_catalog_imports")
                    .insert(
                        {
                            "organization_id": str(tenant.org_id),
                            "vendor_id": account["vendor_id"],
                            "item_name": name,
                            "external_sku": row.get("sku") or row.get("external_sku"),
                            "unit": row.get("unit") or row.get("uom"),
                            "pack_size": row.get("pack_size"),
                            "unit_price": row.get("unit_price") or row.get("price"),
                            "currency": row.get("currency") or "SGD",
                            "moq": row.get("moq"),
                            "raw": row,
                            "import_channel": "csv" if payload.format == "csv" else "rest_api",
                        }
                    )
                    .execute()
                )
                imported += 1
            except Exception as exc:  # noqa: BLE001
                skipped += 1
                errors.append(f"row {index + 1}: {exc}")

        readiness = min(Decimal("100"), Decimal(imported) * Decimal("5"))
        await (
            client.table("vendors")
            .update({"catalog_readiness_pct": float(readiness)})
            .eq("id", account["vendor_id"])
            .eq("organization_id", str(tenant.org_id))
            .execute()
        )
        await self.update_account(
            tenant, SupplierAccountUpdate(onboarding_step="pricing")
        )
        return SupplierCatalogImportResult(imported=imported, skipped=skipped, errors=errors[:20])

    async def ingest_webhook(
        self, tenant: TenantContext, payload: SupplierWebhookIngest
    ) -> dict[str, Any]:
        account = await self._require_account(tenant)
        client = await self._client()
        event = {
            "organization_id": str(tenant.org_id),
            "vendor_id": account["vendor_id"],
            "event_type": payload.event_type,
            "payload": payload.payload,
        }
        # Persist as negotiation/network style audit when table exists; always acknowledge.
        try:
            await (
                client.table("supplier_webhook_events")
                .insert({**event, "id": str(uuid4())})
                .execute()
            )
        except Exception:
            logger.info(
                "supplier webhook accepted (event table optional)",
                event_type=payload.event_type,
                vendor_id=account["vendor_id"],
            )
        return {"status": "accepted", "event_type": payload.event_type}

    async def _metrics(self, tenant: TenantContext, account: SupplierAccount | None) -> SupplierHomepageMetrics:
        if not account:
            return SupplierHomepageMetrics()
        client = await self._client()
        vendor_id = str(account.vendor_id)
        org_id = str(tenant.org_id)

        invitations = (
            await client.table("supplier_invitations")
            .select("id,status,rfq_id")
            .eq("organization_id", org_id)
            .eq("vendor_id", vendor_id)
            .execute()
        ).data or []
        offers = (
            await client.table("rfq_offer_responses")
            .select("id,status")
            .eq("organization_id", org_id)
            .eq("vendor_id", vendor_id)
            .execute()
        ).data or []
        perf = (
            await client.table("supplier_performance_metrics")
            .select("fill_rate")
            .eq("organization_id", org_id)
            .eq("vendor_id", vendor_id)
            .limit(1)
            .execute()
        ).data or []
        vendor = (
            await client.table("vendors")
            .select("catalog_readiness_pct")
            .eq("id", vendor_id)
            .eq("organization_id", org_id)
            .limit(1)
            .execute()
        ).data or []

        open_invites = [
            row for row in invitations if row.get("status") in {"INVITED", "VIEWED"}
        ]
        won = [row for row in offers if row.get("status") == "ACCEPTED"]
        fill = perf[0].get("fill_rate") if perf else None
        readiness = vendor[0].get("catalog_readiness_pct") if vendor else 0

        # Open RFQ value: sum landed totals of open invitations when offer versions exist.
        open_rfq_value: Decimal | None = None
        try:
            rfq_ids = [row["rfq_id"] for row in open_invites if row.get("rfq_id")]
            if rfq_ids:
                items = (
                    await client.table("rfq_items")
                    .select("quantity")
                    .eq("organization_id", org_id)
                    .in_("rfq_id", rfq_ids)
                    .execute()
                ).data or []
                # Quantity proxy only — no fake currency inflation.
                open_rfq_value = Decimal(str(sum(float(i.get("quantity") or 0) for i in items)))
        except Exception:
            open_rfq_value = None

        return SupplierHomepageMetrics(
            open_rfq_value=open_rfq_value,
            rfqs_requiring_response=len(open_invites),
            offers_submitted=len(offers),
            orders_won=len(won),
            agent_sourced_revenue=None,
            catalog_readiness_pct=Decimal(str(readiness or 0)),
            fill_rate=Decimal(str(fill)) if fill is not None else None,
        )

    async def workspace_summary(self, tenant: TenantContext) -> SupplierWorkspaceSummary:
        account = await self.get_account(tenant)
        metrics = await self._metrics(tenant, account)
        if not account:
            return SupplierWorkspaceSummary(account=None, metrics=metrics)
        return SupplierWorkspaceSummary(
            account=account,
            metrics=metrics,
            locations=await self.list_locations(tenant),
            service_areas=await self.list_service_areas(tenant),
            delivery_slots=await self.list_delivery_slots(tenant),
            capabilities=await self.list_capabilities(tenant),
            commercial_terms=await self.get_commercial_terms(tenant),
            onboarding_complete=account.onboarding_step == "complete"
            and account.agent_endpoint_enabled,
        )

    async def list_supplier_rfqs(self, tenant: TenantContext) -> list[dict[str, Any]]:
        """RFQs invited to this supplier only — no cross-org leakage."""
        account = await self.get_account(tenant)
        if not account:
            return []
        client = await self._client()
        invites = (
            await client.table("supplier_invitations")
            .select("*, rfq:rfqs(*)")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(account.vendor_id))
            .execute()
        ).data or []
        return invites

    async def list_supplier_offers(self, tenant: TenantContext) -> list[dict[str, Any]]:
        account = await self.get_account(tenant)
        if not account:
            return []
        client = await self._client()
        offers = (
            await client.table("rfq_offer_responses")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(account.vendor_id))
            .execute()
        ).data or []
        return offers
