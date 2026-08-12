from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.constants import CONFIDENCE_REVIEW_THRESHOLD
from app.core.logging import get_logger
from app.db.repositories.alerts import AlertsRepository
from app.db.supabase_client import get_async_supabase_admin
from app.services.vendor_service import VendorService

logger = get_logger(__name__)

_PRICE_VARIANCE_ALERT_THRESHOLD = 0.10
_MIN_PRICE_HISTORY_FOR_ALERT = 2


@dataclass(slots=True)
class VendorResolutionResult:
    vendor: dict[str, Any] | None
    review_required: bool
    review_reason: str | None


class VendorIntelligenceService:
    """Update vendor, spend, and price context from approved purchase evidence."""

    def __init__(self) -> None:
        self._vendors = VendorService()
        self._alerts = AlertsRepository()

    async def resolve_vendor_for_document(
        self,
        tenant: TenantContext,
        *,
        raw_vendor_name: str | None,
        overall_confidence: float | None,
    ) -> VendorResolutionResult:
        if not raw_vendor_name or not raw_vendor_name.strip():
            return VendorResolutionResult(
                vendor=None,
                review_required=True,
                review_reason="Supplier could not be identified from this purchase document.",
            )

        vendor = await self._vendors.normalise(tenant, raw_vendor_name, auto_create=False)
        if vendor:
            return VendorResolutionResult(vendor=vendor, review_required=False, review_reason=None)

        confidence = float(overall_confidence or 0)
        if confidence >= CONFIDENCE_REVIEW_THRESHOLD:
            vendor = await self._vendors.normalise(tenant, raw_vendor_name, auto_create=True)
            return VendorResolutionResult(vendor=vendor, review_required=False, review_reason=None)

        return VendorResolutionResult(
            vendor=None,
            review_required=True,
            review_reason=(
                "Supplier name needs review before Neumas can attach vendor intelligence."
            ),
        )

    async def enrich_purchase_document(
        self,
        tenant: TenantContext,
        *,
        document: dict[str, Any],
        line_items: list[dict[str, Any]],
        item_links: dict[str, UUID],
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        if client is None:
            raise RuntimeError("Supabase admin client unavailable")

        document_id = UUID(str(document["id"]))
        resolution = await self.resolve_vendor_for_document(
            tenant,
            raw_vendor_name=document.get("raw_vendor_name"),
            overall_confidence=document.get("overall_confidence"),
        )
        vendor = resolution.vendor
        vendor_id = str(vendor["id"]) if vendor else None

        if vendor_id:
            await (
                client.table("documents")
                .update({"vendor_id": vendor_id})
                .eq("id", str(document_id))
                .eq("organization_id", str(tenant.org_id))
                .execute()
            )

        if resolution.review_required:
            await self._create_vendor_review_alert(
                tenant,
                document_id=document_id,
                raw_vendor_name=document.get("raw_vendor_name"),
                review_reason=resolution.review_reason,
            )

        price_observations_recorded = 0
        price_alerts_created = 0
        linked_items = 0

        for line_item in line_items:
            line_item_id = str(line_item["id"])
            item_id = item_links.get(line_item_id)
            if item_id is None:
                continue

            linked_items += 1
            if vendor_id:
                await self._attach_vendor_to_item(
                    client,
                    tenant,
                    item_id=item_id,
                    vendor_id=UUID(vendor_id),
                    vendor_name=str(vendor.get("name") or document.get("raw_vendor_name") or "Supplier"),
                )
                await (
                    client.table("document_line_items")
                    .update({"vendor_id": vendor_id})
                    .eq("id", line_item_id)
                    .eq("organization_id", str(tenant.org_id))
                    .execute()
                )

            observation = await self._record_price_observation(
                client,
                tenant,
                document=document,
                line_item=line_item,
                item_id=item_id,
                vendor=vendor,
            )
            if observation is not None:
                price_observations_recorded += 1
                created_alert = await self._create_price_variance_alert_if_needed(
                    client,
                    tenant,
                    item_id=item_id,
                    vendor=vendor,
                    observation=observation,
                )
                if created_alert:
                    price_alerts_created += 1

        return {
            "vendor_id": vendor_id,
            "vendor_name": vendor.get("name") if vendor else None,
            "vendor_review_required": resolution.review_required,
            "vendor_review_reason": resolution.review_reason,
            "price_observations_recorded": price_observations_recorded,
            "price_alerts_created": price_alerts_created,
            "linked_items": linked_items,
        }

    async def _attach_vendor_to_item(
        self,
        client: Any,
        tenant: TenantContext,
        *,
        item_id: UUID,
        vendor_id: UUID,
        vendor_name: str,
    ) -> None:
        item_resp = await (
            client.table("inventory_items")
            .select("id, supplier_info, vendor_id")
            .eq("id", str(item_id))
            .eq("property_id", str(tenant.property_id) if tenant.property_id else "")
            .single()
            .execute()
        )
        row = dict(item_resp.data or {})
        supplier_info = row.get("supplier_info")
        if not isinstance(supplier_info, dict):
            supplier_info = {}
        update_payload = {"supplier_info": {**supplier_info, "name": vendor_name}}
        if not row.get("vendor_id"):
            update_payload["vendor_id"] = str(vendor_id)
        await client.table("inventory_items").update(update_payload).eq("id", str(item_id)).execute()

    async def _record_price_observation(
        self,
        client: Any,
        tenant: TenantContext,
        *,
        document: dict[str, Any],
        line_item: dict[str, Any],
        item_id: UUID,
        vendor: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if vendor is None:
            return None

        quantity = float(
            line_item.get("normalized_quantity")
            or line_item.get("raw_quantity")
            or 0
        )
        if quantity <= 0:
            return None

        unit_price = line_item.get("unit_price") or line_item.get("raw_price")
        raw_total = line_item.get("raw_total")
        if unit_price is None and raw_total is not None:
            try:
                unit_price = float(raw_total) / quantity
            except Exception:
                unit_price = None
        if unit_price is None:
            return None

        purchase_date = (
            document.get("approved_at")
            or document.get("created_at")
            or datetime.now(UTC).isoformat()
        )
        existing = await (
            client.table("item_price_history")
            .select("id")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id) if tenant.property_id else "")
            .eq("vendor_id", str(vendor["id"]))
            .eq("item_id", str(item_id))
            .eq("purchase_date", str(purchase_date))
            .eq("price", str(unit_price))
            .eq("quantity", str(quantity))
            .limit(1)
            .execute()
        )
        if existing.data:
            return None

        observation_payload = {
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "vendor_id": str(vendor["id"]),
            "item_id": str(item_id),
            "item_name": line_item.get("normalized_name") or line_item.get("raw_name") or "Item",
            "vendor_name": str(vendor.get("name") or "Supplier"),
            "price": str(unit_price),
            "quantity": str(quantity),
            "unit": line_item.get("normalized_unit") or line_item.get("raw_unit") or "unit",
            "purchase_date": str(purchase_date),
        }
        response = await client.table("item_price_history").insert(observation_payload).execute()
        row = response.data[0] if response.data else None
        if row:
            await client.table("inventory_items").update(
                {
                    "cost_per_unit": str(unit_price),
                    "supplier_info": {"name": str(vendor.get("name") or "Supplier")},
                }
            ).eq("id", str(item_id)).execute()
        return row

    async def _create_price_variance_alert_if_needed(
        self,
        client: Any,
        tenant: TenantContext,
        *,
        item_id: UUID,
        vendor: dict[str, Any] | None,
        observation: dict[str, Any],
    ) -> bool:
        if vendor is None:
            return False

        history_resp = await (
            client.table("item_price_history")
            .select("id, price, purchase_date, item_name")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id) if tenant.property_id else "")
            .eq("vendor_id", str(vendor["id"]))
            .eq("item_id", str(item_id))
            .order("purchase_date")
            .execute()
        )
        history_rows = [row for row in (history_resp.data or []) if isinstance(row, dict)]
        if len(history_rows) < _MIN_PRICE_HISTORY_FOR_ALERT:
            return False

        latest = history_rows[-1]
        previous = history_rows[-2]
        latest_price = float(latest.get("price") or 0)
        previous_price = float(previous.get("price") or 0)
        if previous_price <= 0:
            return False

        change_ratio = (latest_price - previous_price) / previous_price
        if abs(change_ratio) < _PRICE_VARIANCE_ALERT_THRESHOLD:
            return False

        open_alerts = await self._alerts.list(
            tenant,
            state="open",
            alert_type="unusual_price_increase",
            limit=25,
        )
        if any(str(alert.get("item_id")) == str(item_id) for alert in open_alerts):
            return False

        direction = "increased" if change_ratio > 0 else "decreased"
        await self._alerts.create(
            tenant,
            alert_type="unusual_price_increase",
            severity="medium" if change_ratio < 0 else "high",
            title=f"{latest.get('item_name') or 'Item'} price {direction}",
            body=(
                f"{vendor.get('name') or 'Supplier'} price changed from "
                f"{previous_price:.2f} to {latest_price:.2f}."
            ),
            item_id=item_id,
            metadata={
                "vendor_id": str(vendor["id"]),
                "vendor_name": vendor.get("name"),
                "old_price": previous_price,
                "new_price": latest_price,
                "change_ratio": round(change_ratio, 4),
                "purchase_date": latest.get("purchase_date"),
            },
        )
        return True

    async def _create_vendor_review_alert(
        self,
        tenant: TenantContext,
        *,
        document_id: UUID,
        raw_vendor_name: str | None,
        review_reason: str | None,
    ) -> None:
        open_alerts = await self._alerts.list(
            tenant,
            state="open",
            alert_type="supplier_mapping_review",
            limit=50,
        )
        if any(str(alert.get("metadata", {}).get("document_id")) == str(document_id) for alert in open_alerts):
            return
        await self._alerts.create(
            tenant,
            alert_type="supplier_mapping_review",
            severity="medium",
            title="Supplier mapping needs review",
            body=review_reason or "Neumas needs help confirming the supplier for a purchase document.",
            metadata={
                "document_id": str(document_id),
                "raw_vendor_name": raw_vendor_name,
            },
        )
