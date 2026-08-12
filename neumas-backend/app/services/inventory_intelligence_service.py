from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.constants import ACTIVE_OPERATIONAL_FORECAST_TYPE
from app.db.repositories.inventory_movements import InventoryMovementsRepository
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.inventory import (
    InventoryIntelligenceResponse,
    InventoryItemResponse,
    InventoryTimelineEvent,
)
from app.services.inventory_service import InventoryService


class InventoryIntelligenceService:
    """Explain inventory rows using existing ledger, prediction, and shopping evidence."""

    def __init__(self) -> None:
        self._inventory = InventoryService()
        self._movements = InventoryMovementsRepository()

    async def get_item_intelligence(
        self,
        item_id: UUID,
        tenant: TenantContext,
    ) -> InventoryIntelligenceResponse | None:
        item = await self._inventory.get_item(item_id, tenant)
        if item is None:
            return None

        movement_rows = await self._movements.list_for_item(tenant, item_id, limit=20)
        client = await get_async_supabase_admin()

        prediction_resp = await (
            client.table("predictions")
            .select("id,prediction_date,predicted_depletion_date,confidence,features_used")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id))
            .eq("item_id", str(item_id))
            .eq("prediction_type", str(ACTIVE_OPERATIONAL_FORECAST_TYPE))
            .order("prediction_date", desc=False)
            .limit(1)
            .execute()
        )
        prediction = (prediction_resp.data or [None])[0]

        shopping_item_resp = await (
            client.table("shopping_list_items")
            .select("id,shopping_list_id,created_at")
            .eq("inventory_item_id", str(item_id))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        shopping_item = (shopping_item_resp.data or [None])[0]
        shopping_list = None
        if shopping_item and shopping_item.get("shopping_list_id"):
            shopping_resp = await (
                client.table("shopping_lists")
                .select("id,status,updated_at")
                .eq("id", str(shopping_item["shopping_list_id"]))
                .limit(1)
                .execute()
            )
            shopping_list = (shopping_resp.data or [None])[0]

        supplier_name = self._supplier_name(item)
        last_purchased_at = next(
            (self._dt(row.get("created_at")) for row in movement_rows if str(row.get("movement_type")) == "purchase"),
            None,
        )
        last_observed_at = self._dt(item.updated_at) if isinstance(item.updated_at, datetime) else self._dt(item.updated_at)
        learning_notes: list[str] = []
        if item.average_daily_usage in {None, Decimal("0")}:
            learning_notes.append("Typical usage is still learning from ledger history.")
        if prediction is None:
            learning_notes.append("Next depletion needs more history before Neumas can forecast it.")
        if supplier_name is None:
            learning_notes.append("Supplier is not mapped yet.")

        return InventoryIntelligenceResponse(
            item=item,
            last_observed_at=last_observed_at,
            last_purchased_at=last_purchased_at,
            latest_price=item.cost_per_unit,
            supplier_name=supplier_name,
            recent_usage_rate=item.average_daily_usage,
            predicted_depletion_at=self._dt(prediction.get("predicted_depletion_date") if prediction else None),
            forecast_confidence=Decimal(str(prediction.get("confidence"))) if prediction and prediction.get("confidence") is not None else None,
            low_stock_status=item.stock_status,
            expiry_status=self._expiry_status(item),
            reorder_state=str(shopping_list.get("status")) if isinstance(shopping_list, dict) and shopping_list.get("status") else None,
            learning_notes=learning_notes,
            timeline=self._build_timeline(item, movement_rows, prediction, shopping_list),
        )

    def _build_timeline(
        self,
        item: InventoryItemResponse,
        movement_rows: list[dict[str, Any]],
        prediction: dict[str, Any] | None,
        shopping_list: dict[str, Any] | None,
    ) -> list[InventoryTimelineEvent]:
        events: list[InventoryTimelineEvent] = []
        for row in movement_rows[:4]:
            when = self._dt(row.get("created_at"))
            if when is None:
                continue
            movement_type = str(row.get("movement_type") or "movement")
            title = movement_type.replace("_", " ").title()
            detail = f"Quantity moved by {row.get('quantity_delta')} {row.get('unit') or item.unit}."
            if movement_type == "usage":
                title = "Usage recorded"
                detail = f"Observed consumption reduced stock by {abs(float(row.get('quantity_delta') or 0))} {row.get('unit') or item.unit}."
            elif movement_type == "waste":
                title = "Waste recorded"
                detail = f"Waste reduced stock by {abs(float(row.get('quantity_delta') or 0))} {row.get('unit') or item.unit}."
            elif movement_type == "manual_adjustment":
                title = "Stock count confirmed"
                detail = str(row.get("notes") or "Physical stock count updated the ledger-backed quantity.")
            events.append(
                InventoryTimelineEvent(
                    event_type=movement_type,
                    title=title,
                    detail=detail,
                    created_at=when,
                    reference_id=str(row.get("reference_id")) if row.get("reference_id") else None,
                    reference_type=str(row.get("reference_type")) if row.get("reference_type") else None,
                )
            )
        if prediction:
            when = self._dt(prediction.get("prediction_date"))
            if when is not None:
                events.append(
                    InventoryTimelineEvent(
                        event_type="prediction",
                        title="Forecast updated",
                        detail="Neumas recalculated expected depletion from current ledger evidence.",
                        created_at=when,
                        reference_id=str(prediction.get("id")) if prediction.get("id") else None,
                        reference_type="prediction",
                    )
                )
        if shopping_list and shopping_list.get("updated_at"):
            when = self._dt(shopping_list.get("updated_at"))
            if when is not None:
                events.append(
                    InventoryTimelineEvent(
                        event_type="reorder",
                        title="Shopping lifecycle",
                        detail=f"Item is currently linked to a {shopping_list.get('status')} shopping plan.",
                        created_at=when,
                        reference_id=str(shopping_list.get("id")) if shopping_list.get("id") else None,
                        reference_type="shopping_list",
                    )
                )
        return sorted(events, key=lambda event: event.created_at, reverse=True)

    def _supplier_name(self, item: InventoryItemResponse) -> str | None:
        supplier_info = item.supplier_info or {}
        for key in ("name", "supplier_name", "vendor_name"):
            value = supplier_info.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _expiry_status(self, item: InventoryItemResponse) -> str | None:
        raw = item.metadata.get("expiry_date") if isinstance(item.metadata, dict) else None
        if not raw:
            return None
        expiry = self._dt(raw)
        if expiry is None:
            return None
        delta_days = (expiry.date() - datetime.utcnow().date()).days
        if delta_days < 0:
            return "expired"
        if delta_days <= 3:
            return "use_soon"
        return "fresh"

    def _dt(self, value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str) and value:
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        return None
