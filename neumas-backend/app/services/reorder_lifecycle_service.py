from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.celery_app import celery_app
from app.core.constants import PredictionType
from app.core.logging import get_logger
from app.db.repositories.shopping_lists import get_shopping_lists_repository
from app.services.audit_service import AuditService
from app.services.inventory_ledger_service import InventoryLedgerService

logger = get_logger(__name__)

ACTIVE_STATUSES = {
    "draft",
    "recommended",
    "awaiting_approval",
    "approved",
    "order_ready",
    "order_placed_manually",
    "modified",
    "order_sent",
    "partially_received",
}

TRANSITIONS: dict[str, set[str]] = {
    "draft": {"recommended", "awaiting_approval", "approved", "cancelled"},
    "recommended": {"awaiting_approval", "approved", "modified", "rejected", "cancelled"},
    "awaiting_approval": {"approved", "modified", "rejected", "cancelled"},
    "approved": {"order_ready", "order_placed_manually", "modified", "order_sent", "partially_received", "received", "cancelled"},
    "order_ready": {"order_placed_manually", "order_sent", "partially_received", "received", "cancelled"},
    "order_placed_manually": {"partially_received", "received", "cancelled"},
    "modified": {"awaiting_approval", "approved", "order_ready", "order_placed_manually", "order_sent", "partially_received", "received", "cancelled"},
    "rejected": set(),
    "order_sent": {"partially_received", "received", "cancelled"},
    "partially_received": {"received", "cancelled"},
    "received": set(),
    "cancelled": set(),
}


@dataclass(slots=True)
class TransitionResult:
    shopping_list: dict
    transition: dict


class ReorderLifecycleService:
    """Durable reorder approval workflow built on top of shopping lists."""

    def __init__(self) -> None:
        self._audit = AuditService()
        self._ledger = InventoryLedgerService()

    async def transition_list(
        self,
        tenant: TenantContext,
        list_id: UUID,
        *,
        next_state: str,
        idempotency_key: str,
        reason: str | None = None,
        note: str | None = None,
        source_prediction_id: UUID | None = None,
        source_recommendation: dict | None = None,
        metadata: dict | None = None,
    ) -> TransitionResult:
        repo = await get_shopping_lists_repository(tenant)
        shopping_list = await repo.get_by_id(tenant, list_id)
        if shopping_list is None:
            raise ValueError("Shopping list not found")

        existing = await repo.get_transition_by_idempotency(tenant, list_id, idempotency_key)
        if existing is not None:
            refreshed = await repo.get_by_id(tenant, list_id)
            return TransitionResult(shopping_list=refreshed or shopping_list, transition=existing)

        current_state = str(shopping_list.get("status") or "draft")
        normalized_next = next_state.lower()
        if normalized_next not in TRANSITIONS.get(current_state, set()):
            raise ValueError(f"Invalid transition: {current_state} -> {normalized_next}")

        now = datetime.now(UTC).isoformat()
        update_data = {
            "status": normalized_next,
            "status_reason": reason,
            "last_transition_at": now,
            "last_transition_by_id": str(tenant.user_id),
        }
        if normalized_next == "approved":
            update_data["approved_at"] = now
            update_data["approved_by_id"] = str(tenant.user_id)
        if normalized_next in {"approved", "order_ready", "order_placed_manually", "order_sent"}:
            generation_params = shopping_list.get("generation_params")
            if not isinstance(generation_params, dict):
                generation_params = {}
            if normalized_next == "approved":
                generation_params["order_representation_state"] = "order_ready"
            else:
                generation_params["order_representation_state"] = normalized_next
            update_data["generation_params"] = generation_params

        updated = await repo.update(tenant, list_id, update_data)
        transition = await repo.create_transition(
            tenant,
            {
                "shopping_list_id": str(list_id),
                "organization_id": str(tenant.org_id),
                "property_id": str(tenant.property_id) if tenant.property_id else None,
                "actor_id": str(tenant.user_id),
                "previous_state": current_state,
                "next_state": normalized_next,
                "reason": reason,
                "note": note,
                "source_prediction_id": str(source_prediction_id) if source_prediction_id else None,
                "source_recommendation": source_recommendation or {},
                "idempotency_key": idempotency_key,
                "metadata": metadata or {},
            },
        )

        await self._audit.log(
            tenant=tenant,
            action="reorder.transition",
            resource_type="shopping_lists",
            resource_id=list_id,
            before_state={"status": current_state},
            after_state={"status": normalized_next},
            metadata={
                "reason": reason,
                "note": note,
                "idempotency_key": idempotency_key,
                "source_prediction_id": str(source_prediction_id) if source_prediction_id else None,
                **(metadata or {}),
            },
        )
        return TransitionResult(shopping_list=updated, transition=transition)

    async def receive_item(
        self,
        tenant: TenantContext,
        list_id: UUID,
        item_id: UUID,
        *,
        idempotency_key: str,
        quantity_received: Decimal | None = None,
        actual_price: Decimal | None = None,
        note: str | None = None,
    ) -> dict:
        repo = await get_shopping_lists_repository(tenant)
        shopping_list = await repo.get_by_id(tenant, list_id)
        if shopping_list is None:
            raise ValueError("Shopping list not found")

        item = await repo.get_item(tenant, list_id, item_id)
        if item is None:
            raise ValueError("Shopping list item not found")

        if item.get("receipt_idempotency_key") == idempotency_key:
            return item

        quantity = Decimal(str(quantity_received if quantity_received is not None else item.get("quantity") or 0))
        if quantity <= 0:
            raise ValueError("quantity_received must be greater than zero")

        payload = {
            "is_purchased": True,
            "purchased_at": datetime.now(UTC).isoformat(),
            "received_at": datetime.now(UTC).isoformat(),
            "received_by_id": str(tenant.user_id),
            "received_quantity": str(quantity),
            "receipt_idempotency_key": idempotency_key,
        }
        if actual_price is not None:
            payload["actual_price"] = str(actual_price)

        updated_item = await repo.update_item(tenant, list_id, item_id, payload)

        inventory_item_id = item.get("inventory_item_id")
        if inventory_item_id:
            await self._ledger.apply_purchase(
                tenant=tenant,
                item_id=UUID(str(inventory_item_id)),
                quantity=float(quantity),
                unit=str(item.get("unit") or "unit"),
                idempotency_key=idempotency_key,
            )

        all_items = await repo.get_items(tenant, list_id)
        purchased_items = sum(1 for row in all_items if row.get("is_purchased"))
        total_items = len(all_items)
        current_status = str(shopping_list.get("status") or "draft")
        if total_items > 0 and purchased_items >= total_items:
            target_state = "received"
        else:
            target_state = "partially_received"

        if current_status != target_state:
            await self.transition_list(
                tenant,
                list_id,
                next_state=target_state,
                idempotency_key=f"{idempotency_key}:state",
                reason="items_received",
                note=note,
                metadata={"item_id": str(item_id), "purchased_items": purchased_items, "total_items": total_items},
            )

        await repo.update_totals(tenant, list_id)
        linked_prediction_ids = []
        if item.get("prediction_id"):
            linked_prediction_ids.append(str(item["prediction_id"]))
        source_prediction_ids = shopping_list.get("source_prediction_ids")
        if isinstance(source_prediction_ids, list):
            linked_prediction_ids.extend(str(prediction_id) for prediction_id in source_prediction_ids if prediction_id)

        if linked_prediction_ids:
            try:
                celery_app.send_task(
                    "evaluation.backfill_prediction_evaluations",
                    args=[str(tenant.org_id), str(tenant.property_id)],
                    kwargs={
                        "prediction_type": str(PredictionType.STOCKOUT),
                        "older_than_days": 0,
                        "limit": max(25, len(set(linked_prediction_ids)) * 5),
                    },
                    queue="evaluation",
                )
            except Exception as exc:
                logger.warning(
                    "Failed to enqueue prediction evaluation after receipt",
                    list_id=str(list_id),
                    item_id=str(item_id),
                    error=str(exc),
                )
        return updated_item

    async def match_document_receipt(
        self,
        tenant: TenantContext,
        *,
        document_id: UUID,
        matched_items: list[dict[str, Any]],
    ) -> dict[str, Any]:
        repo = await get_shopping_lists_repository(tenant)
        open_lists = await repo.get_by_property(tenant, limit=25)
        actionable_statuses = {"approved", "order_ready", "order_placed_manually", "order_sent", "partially_received"}
        candidate_lists = [
            row for row in open_lists if str(row.get("status") or "") in actionable_statuses
        ]
        if not candidate_lists or not matched_items:
            return {"matched_list_ids": [], "matched_item_count": 0}

        matched_list_ids: set[str] = set()
        matched_item_count = 0
        item_ids = {str(row["item_id"]): row for row in matched_items if row.get("item_id")}

        for shopping_list in candidate_lists:
            list_id = UUID(str(shopping_list["id"]))
            list_items = await repo.get_items(tenant, list_id)
            for list_item in list_items:
                inventory_item_id = list_item.get("inventory_item_id")
                if not inventory_item_id:
                    continue
                matched = item_ids.get(str(inventory_item_id))
                if matched is None:
                    continue
                if list_item.get("receipt_idempotency_key") == f"document:{document_id}:{list_item['id']}":
                    continue

                payload = {
                    "is_purchased": True,
                    "purchased_at": datetime.now(UTC).isoformat(),
                    "received_at": datetime.now(UTC).isoformat(),
                    "received_by_id": str(tenant.user_id),
                    "received_quantity": str(matched.get("quantity") or list_item.get("quantity") or 0),
                    "receipt_idempotency_key": f"document:{document_id}:{list_item['id']}",
                }
                if matched.get("actual_price") is not None:
                    payload["actual_price"] = str(matched["actual_price"])
                await repo.update_item(tenant, list_id, UUID(str(list_item["id"])), payload)
                matched_item_count += 1
                matched_list_ids.add(str(list_id))

            if str(list_id) not in matched_list_ids:
                continue

            refreshed_items = await repo.get_items(tenant, list_id)
            purchased_items = sum(1 for row in refreshed_items if row.get("is_purchased"))
            total_items = len(refreshed_items)
            target_state = "received" if total_items and purchased_items >= total_items else "partially_received"
            if str(shopping_list.get("status") or "") != target_state:
                await self.transition_list(
                    tenant,
                    list_id,
                    next_state=target_state,
                    idempotency_key=f"document-receipt:{document_id}:{list_id}",
                    reason="document_receipt_matched",
                    note="Purchase document matched to an open reorder plan.",
                    metadata={"document_id": str(document_id), "matched_item_count": matched_item_count},
                )
            await repo.update_totals(tenant, list_id)

        return {
            "matched_list_ids": sorted(matched_list_ids),
            "matched_item_count": matched_item_count,
        }


async def get_reorder_lifecycle_service() -> ReorderLifecycleService:
    return ReorderLifecycleService()
