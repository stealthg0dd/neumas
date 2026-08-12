from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class PurchaseSummaryService:
    """Build shared purchase intelligence summaries from durable document records."""

    async def get_latest_summary(
        self,
        tenant: TenantContext,
        *,
        scan_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        if client is None:
            logger.warning("Purchase summary unavailable because Supabase admin client is missing")
            return None

        query = (
            client.table("documents")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
        )
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        if scan_id:
            query = query.eq("scan_id", str(scan_id))
        response = await query.order("created_at", desc=True).limit(1).execute()
        rows = response.data or []
        if not rows:
            return None

        document = dict(rows[0])
        line_resp = await (
            client.table("document_line_items")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .eq("document_id", str(document["id"]))
            .execute()
        )
        line_items = list(line_resp.data or [])

        history_resp = await (
            client.table("item_price_history")
            .select("id")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id) if tenant.property_id else "")
            .eq("purchase_date", str(document.get("approved_at") or document.get("created_at") or ""))
            .execute()
        )
        return self._build_summary(document, line_items, history_resp.data or [])

    def _build_summary(
        self,
        document: dict[str, Any],
        line_items: list[dict[str, Any]],
        price_observations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        category_counter = Counter(
            str(row.get("category_name")).strip()
            for row in line_items
            if row.get("category_name")
        )
        categories = [name for name, _count in category_counter.most_common()]
        confidences = [float(row.get("confidence")) for row in line_items if row.get("confidence") is not None]
        canonicalized_count = sum(1 for row in line_items if row.get("canonical_item_id"))
        unresolved_count = sum(1 for row in line_items if row.get("review_needed"))
        purchase_date = document.get("document_date") or document.get("approved_at") or document.get("created_at")
        if isinstance(purchase_date, date | datetime):
            purchase_date = purchase_date.isoformat()

        return {
            "document_id": str(document.get("id")),
            "scan_id": str(document.get("scan_id")) if document.get("scan_id") else None,
            "supplier_name": document.get("raw_vendor_name"),
            "purchase_date": purchase_date,
            "total_purchase_value": float(document.get("total_amount")) if document.get("total_amount") is not None else None,
            "currency": document.get("currency"),
            "products_added": len(line_items),
            "categories_identified": categories,
            "canonicalized_count": canonicalized_count,
            "unresolved_count": unresolved_count,
            "price_observations_created": len(price_observations),
            "average_extraction_confidence": (sum(confidences) / len(confidences)) if confidences else None,
        }
