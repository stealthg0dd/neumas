"""
Reorder service — converts forecast risk into durable shopping decisions.

This service is the canonical orchestration layer between:

stockout prediction
-> reorder recommendation
-> durable shopping/purchase-plan record
-> lifecycle review / approval / rejection
-> receipt / ledger
-> prediction evaluation
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.constants import (
    ACTIVE_OPERATIONAL_FORECAST_TYPE,
    REORDER_HORIZON_DAYS,
    REORDER_SAFETY_BUFFER,
)
from app.core.logging import get_logger
from app.db.repositories.shopping_lists import get_shopping_lists_repository
from app.db.supabase_client import get_async_supabase_admin
from app.services.reorder_lifecycle_service import (
    ACTIVE_STATUSES,
    ReorderLifecycleService,
)

logger = get_logger(__name__)

_URGENCY_ORDER = {"critical": 0, "urgent": 1, "soon": 2, "monitor": 3, "later": 4}
_MANAGED_PLAN_STATUSES = {"draft", "recommended", "awaiting_approval", "modified"}
_RESULT_CREATED = "CREATED"
_RESULT_UPDATED = "UPDATED"
_RESULT_NO_ELIGIBLE_ITEMS = "NO_ELIGIBLE_ITEMS"
_RESULT_INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
_RESULT_PREDICTION_PENDING = "PREDICTION_PENDING"


class ReorderService:
    """Canonical reorder decision/orchestration service."""

    def __init__(self) -> None:
        self._lifecycle = ReorderLifecycleService()

    async def get_recommendations(
        self,
        tenant: TenantContext,
        horizon_days: int = REORDER_HORIZON_DAYS,
        safety_buffer: float = REORDER_SAFETY_BUFFER,
        min_urgency: str = "soon",
    ) -> list[dict[str, Any]]:
        """Return qualifying recommendation rows without creating a durable plan."""
        context = await self._build_reorder_context(
            tenant,
            prediction_ids=None,
            trigger_context={"source": "read_only_recommendations"},
            horizon_days=horizon_days,
            safety_buffer=safety_buffer,
            min_urgency=min_urgency,
        )
        return context["recommendations"]

    async def get_single_recommendation(
        self,
        tenant: TenantContext,
        item_id: UUID,
        horizon_days: int = REORDER_HORIZON_DAYS,
        safety_buffer: float = REORDER_SAFETY_BUFFER,
    ) -> dict[str, Any] | None:
        """Return reorder recommendation for one item."""
        all_recs = await self.get_recommendations(
            tenant,
            horizon_days=horizon_days,
            safety_buffer=safety_buffer,
            min_urgency="monitor",
        )
        for rec in all_recs:
            if rec["item_id"] == str(item_id):
                return rec
        return None

    async def create_or_update_reorder_plan(
        self,
        tenant: TenantContext,
        *,
        prediction_ids: list[UUID] | None = None,
        trigger_context: dict[str, Any] | None = None,
        horizon_days: int = REORDER_HORIZON_DAYS,
        safety_buffer: float = REORDER_SAFETY_BUFFER,
        min_urgency: str = "soon",
    ) -> dict[str, Any]:
        """Create or update a durable shopping plan from active stockout forecasts."""
        context = await self._build_reorder_context(
            tenant,
            prediction_ids=prediction_ids,
            trigger_context=trigger_context,
            horizon_days=horizon_days,
            safety_buffer=safety_buffer,
            min_urgency=min_urgency,
        )

        if context["result_code"] != _RESULT_CREATED:
            return self._result_payload(
                str(context["result_code"]),
                tenant=tenant,
                recommendations=context.get("recommendations", []),
                shopping_list=None,
                detail=str(context.get("detail") or ""),
            )

        recommendations = context["recommendations"]
        evidence_signature = context["evidence_signature"]
        repo = await get_shopping_lists_repository(tenant)
        existing_lists = await repo.get_by_property(tenant, limit=25)
        managed_lists = [
            row
            for row in existing_lists
            if str((row.get("generation_params") or {}).get("plan_kind") or "") == "forecast_reorder"
        ]

        # Do not immediately regenerate a rejected recommendation without new evidence.
        for row in managed_lists:
            if row.get("status") != "rejected":
                continue
            params = row.get("generation_params") or {}
            if params.get("evidence_signature") == evidence_signature:
                return self._result_payload(
                    _RESULT_NO_ELIGIBLE_ITEMS,
                    tenant=tenant,
                    recommendations=recommendations,
                    shopping_list=row,
                    detail="unchanged_rejected_evidence",
                )

        active_plan = next(
            (
                row
                for row in managed_lists
                if row.get("status") in ACTIVE_STATUSES
            ),
            None,
        )

        if active_plan is not None:
            params = active_plan.get("generation_params") or {}
            if params.get("evidence_signature") == evidence_signature:
                return self._result_payload(
                    _RESULT_UPDATED,
                    tenant=tenant,
                    recommendations=recommendations,
                    shopping_list=active_plan,
                    detail="no_change",
                )

        reusable = next(
            (
                row
                for row in managed_lists
                if row.get("status") in _MANAGED_PLAN_STATUSES
            ),
            None,
        )

        if reusable is not None:
            await self._replace_existing_plan(
                tenant,
                reusable,
                recommendations,
                context,
            )
            refreshed = await repo.get_by_id(tenant, UUID(str(reusable["id"])))
            return self._result_payload(
                _RESULT_UPDATED,
                tenant=tenant,
                recommendations=recommendations,
                shopping_list=refreshed or reusable,
                detail="plan_updated",
            )

        created = await self._create_new_plan(tenant, recommendations, context)
        return self._result_payload(
            _RESULT_CREATED,
            tenant=tenant,
            recommendations=recommendations,
            shopping_list=created,
            detail="plan_created",
        )

    async def _build_reorder_context(
        self,
        tenant: TenantContext,
        *,
        prediction_ids: list[UUID] | None,
        trigger_context: dict[str, Any] | None,
        horizon_days: int,
        safety_buffer: float,
        min_urgency: str,
    ) -> dict[str, Any]:
        if not tenant.property_id:
            return {
                "result_code": _RESULT_INSUFFICIENT_DATA,
                "detail": "property_required",
                "recommendations": [],
                "prediction_ids": [],
                "evidence_signature": None,
            }

        client = await get_async_supabase_admin()
        if client is None:
            return {
                "result_code": _RESULT_INSUFFICIENT_DATA,
                "detail": "admin_client_unavailable",
                "recommendations": [],
                "prediction_ids": [],
                "evidence_signature": None,
            }

        prop_id = str(tenant.property_id)
        org_id = str(tenant.org_id)
        now = datetime.now(UTC)
        end_date = now + timedelta(days=horizon_days)

        inv_resp = await (
            client.table("inventory_items")
            .select(
                "id, organization_id, property_id, vendor_id, supplier_info, "
                "name, quantity, unit, par_level, reorder_point, cost_per_unit, currency"
            )
            .eq("property_id", prop_id)
            .eq("organization_id", org_id)
            .eq("is_active", True)
            .execute()
        )
        inventory_rows = [row for row in (inv_resp.data or []) if isinstance(row, dict)]
        if not inventory_rows:
            return {
                "result_code": _RESULT_INSUFFICIENT_DATA,
                "detail": "no_inventory_items",
                "recommendations": [],
                "prediction_ids": [],
                "evidence_signature": None,
            }

        inventory_by_id = {str(row["id"]): row for row in inventory_rows if row.get("id")}

        pred_query = (
            client.table("predictions")
            .select(
                "id, item_id, inventory_item_id, prediction_type, prediction_date, "
                "predicted_depletion_date, predicted_value, predicted_quantity_needed, "
                "confidence, stockout_risk_level, source_data_window, features_used"
            )
            .eq("property_id", prop_id)
            .eq("prediction_type", str(ACTIVE_OPERATIONAL_FORECAST_TYPE))
            .order("prediction_date")
        )
        if prediction_ids:
            pred_query = pred_query.in_("id", [str(prediction_id) for prediction_id in prediction_ids])

        pred_resp = await pred_query.execute()
        prediction_rows = [row for row in (pred_resp.data or []) if isinstance(row, dict)]
        if not prediction_rows:
            return {
                "result_code": _RESULT_PREDICTION_PENDING,
                "detail": "no_stockout_predictions",
                "recommendations": [],
                "prediction_ids": [],
                "evidence_signature": None,
            }

        vendor_ids = [
            str(row.get("vendor_id"))
            for row in inventory_rows
            if row.get("vendor_id")
        ]
        vendors_by_id: dict[str, str] = {}
        if vendor_ids:
            vendor_resp = await (
                client.table("vendors")
                .select("id, name")
                .in_("id", vendor_ids)
                .execute()
            )
            vendors_by_id = {
                str(row["id"]): str(row.get("name") or "")
                for row in (vendor_resp.data or [])
                if isinstance(row, dict) and row.get("id")
            }

        recommendations: list[dict[str, Any]] = []
        skipped_for_data = 0
        min_urgency_rank = _URGENCY_ORDER.get(min_urgency, 2)

        for prediction in prediction_rows:
            inventory_item_id = str(
                prediction.get("inventory_item_id")
                or prediction.get("item_id")
                or ""
            )
            item = inventory_by_id.get(inventory_item_id)
            if item is None:
                skipped_for_data += 1
                continue

            predicted_depletion_raw = prediction.get("predicted_depletion_date") or prediction.get("prediction_date")
            if not predicted_depletion_raw:
                skipped_for_data += 1
                continue

            predicted_depletion = datetime.fromisoformat(
                str(predicted_depletion_raw).replace("Z", "+00:00")
            )
            if predicted_depletion > end_date:
                continue

            on_hand = float(item.get("quantity") or 0)
            par_level = float(item.get("par_level") or item.get("reorder_point") or 0)
            suggested_quantity = float(
                prediction.get("predicted_quantity_needed")
                or prediction.get("predicted_value")
                or 0
            )
            if suggested_quantity <= 0:
                suggested_quantity = max(0.0, par_level * (1 + safety_buffer) - on_hand)
            if suggested_quantity <= 0:
                continue

            urgency = str(
                prediction.get("stockout_risk_level")
                or _compute_urgency(on_hand, par_level)
            )
            if _URGENCY_ORDER.get(urgency, 99) > min_urgency_rank:
                continue

            supplier = _supplier_name(item, vendors_by_id)
            current_qty = round(on_hand, 3)
            predicted_qty = round(suggested_quantity, 3)
            confidence = float(prediction.get("confidence") or 0)
            estimated_price = item.get("cost_per_unit")
            reason = _build_reason(
                item_name=str(item.get("name") or "Item"),
                urgency=urgency,
                predicted_depletion=predicted_depletion,
                current_qty=current_qty,
                suggested_quantity=predicted_qty,
            )

            recommendations.append(
                {
                    "prediction_id": str(prediction["id"]),
                    "item_id": inventory_item_id,
                    "item_name": str(item.get("name") or "Item"),
                    "unit": str(item.get("unit") or "unit"),
                    "current_quantity": current_qty,
                    "predicted_depletion_date": predicted_depletion.isoformat(),
                    "suggested_quantity": predicted_qty,
                    "predicted_quantity_needed": predicted_qty,
                    "confidence": round(confidence, 4),
                    "estimated_price": float(estimated_price) if estimated_price is not None else None,
                    "currency": item.get("currency") or "USD",
                    "supplier": supplier,
                    "reason": reason,
                    "urgency": urgency,
                    "priority": _priority_from_urgency(urgency),
                }
            )

        if not recommendations:
            return {
                "result_code": _RESULT_INSUFFICIENT_DATA if skipped_for_data == len(prediction_rows) else _RESULT_NO_ELIGIBLE_ITEMS,
                "detail": "no_qualifying_predictions" if skipped_for_data != len(prediction_rows) else "prediction_rows_missing_inventory",
                "recommendations": [],
                "prediction_ids": [],
                "evidence_signature": None,
            }

        recommendations.sort(
            key=lambda row: (
                _URGENCY_ORDER.get(str(row.get("urgency") or "later"), 99),
                str(row.get("predicted_depletion_date") or ""),
                str(row.get("item_name") or ""),
            )
        )
        evidence_signature = _recommendation_signature(recommendations)
        return {
            "result_code": _RESULT_CREATED,
            "detail": "qualifying_predictions_found",
            "recommendations": recommendations,
            "prediction_ids": [row["prediction_id"] for row in recommendations],
            "evidence_signature": evidence_signature,
            "trigger_context": trigger_context or {},
        }

    async def _create_new_plan(
        self,
        tenant: TenantContext,
        recommendations: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        repo = await get_shopping_lists_repository(tenant)
        list_name = f"Reorder Plan - {datetime.now(UTC).strftime('%Y-%m-%d')}"
        generation_params = self._generation_params(context, recommendations)
        shopping_list = await repo.create(
            tenant,
            {
                "organization_id": str(tenant.org_id),
                "name": list_name,
                "status": "draft",
                "notes": "Generated from active stockout forecasts and current on-hand evidence.",
                "generation_params": generation_params,
                "source_prediction_ids": context["prediction_ids"],
                "currency": _first_currency(recommendations),
            },
        )
        await repo.add_items_batch(
            tenant,
            UUID(str(shopping_list["id"])),
            [_recommendation_to_item_payload(row) for row in recommendations],
        )
        await repo.update_totals(tenant, UUID(str(shopping_list["id"])))
        await self._lifecycle.transition_list(
            tenant,
            UUID(str(shopping_list["id"])),
            next_state="recommended",
            idempotency_key=f"forecast-plan:{shopping_list['id']}:{context['evidence_signature']}",
            reason="forecast_risk_detected",
            note="Forecast risk converted into a durable reorder recommendation.",
            source_prediction_id=UUID(str(recommendations[0]["prediction_id"])),
            source_recommendation={"prediction_ids": context["prediction_ids"]},
            metadata={"trigger_context": context.get("trigger_context") or {}},
        )
        refreshed = await repo.get_by_id(tenant, UUID(str(shopping_list["id"])))
        return refreshed or shopping_list

    async def _replace_existing_plan(
        self,
        tenant: TenantContext,
        shopping_list: dict[str, Any],
        recommendations: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> None:
        repo = await get_shopping_lists_repository(tenant)
        list_id = UUID(str(shopping_list["id"]))
        current_status = str(shopping_list.get("status") or "draft")

        await repo.delete_items(tenant, list_id)
        await repo.add_items_batch(
            tenant,
            list_id,
            [_recommendation_to_item_payload(row) for row in recommendations],
        )
        await repo.update(
            tenant,
            list_id,
            {
                "notes": "Generated from active stockout forecasts and current on-hand evidence.",
                "generation_params": self._generation_params(context, recommendations),
                "source_prediction_ids": context["prediction_ids"],
                "currency": _first_currency(recommendations),
            },
        )
        await repo.update_totals(tenant, list_id)

        if current_status == "draft":
            await self._lifecycle.transition_list(
                tenant,
                list_id,
                next_state="recommended",
                idempotency_key=f"forecast-plan:{list_id}:{context['evidence_signature']}",
                reason="forecast_risk_detected",
                note="Forecast risk converted into a durable reorder recommendation.",
                source_prediction_id=UUID(str(recommendations[0]["prediction_id"])),
                source_recommendation={"prediction_ids": context["prediction_ids"]},
                metadata={"trigger_context": context.get("trigger_context") or {}},
            )
        elif current_status in {"recommended", "awaiting_approval"}:
            await self._lifecycle.transition_list(
                tenant,
                list_id,
                next_state="modified",
                idempotency_key=f"forecast-plan-update:{list_id}:{context['evidence_signature']}",
                reason="forecast_inputs_changed",
                note="Forecast evidence changed and the reorder plan was refreshed.",
                source_prediction_id=UUID(str(recommendations[0]["prediction_id"])),
                source_recommendation={"prediction_ids": context["prediction_ids"]},
                metadata={"trigger_context": context.get("trigger_context") or {}},
            )

    def _generation_params(
        self,
        context: dict[str, Any],
        recommendations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "plan_kind": "forecast_reorder",
            "evidence_signature": context["evidence_signature"],
            "trigger_context": context.get("trigger_context") or {},
            "recommendation_count": len(recommendations),
            "recommendations": recommendations,
            "order_representation_state": "order_ready",
            "generated_at": datetime.now(UTC).isoformat(),
        }

    def _result_payload(
        self,
        result_code: str,
        *,
        tenant: TenantContext,
        recommendations: list[dict[str, Any]],
        shopping_list: dict[str, Any] | None,
        detail: str,
    ) -> dict[str, Any]:
        list_id = str(shopping_list["id"]) if shopping_list and shopping_list.get("id") else None
        return {
            "result_code": result_code,
            "detail": detail,
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "shopping_list_id": list_id,
            "job_id": list_id or f"reorder:{tenant.property_id}:{datetime.now(UTC).timestamp()}",
            "message": result_code.lower(),
            "item_count": len(recommendations),
            "prediction_ids": [row["prediction_id"] for row in recommendations],
            "shopping_list": shopping_list,
            "recommendations": recommendations,
        }


def _compute_urgency(on_hand: float, par_level: float) -> str:
    if on_hand <= 0:
        return "critical"
    if par_level > 0 and on_hand < par_level / 2:
        return "urgent"
    if par_level > 0 and on_hand < par_level:
        return "soon"
    return "monitor"


def _priority_from_urgency(urgency: str) -> str:
    return {
        "critical": "critical",
        "urgent": "high",
        "soon": "normal",
        "monitor": "low",
        "later": "low",
    }.get(urgency, "normal")


def _build_reason(
    *,
    item_name: str,
    urgency: str,
    predicted_depletion: datetime,
    current_qty: float,
    suggested_quantity: float,
) -> str:
    predicted_date = predicted_depletion.date().isoformat()
    if urgency == "critical":
        return (
            f"{item_name} is at critical stockout risk with about {current_qty:.1f} on hand. "
            f"Predicted depletion: {predicted_date}. Suggested reorder: {suggested_quantity:.1f}."
        )
    if urgency == "urgent":
        return (
            f"{item_name} is projected to deplete by {predicted_date}. "
            f"Current stock: {current_qty:.1f}. Suggested reorder: {suggested_quantity:.1f}."
        )
    return (
        f"{item_name} has forecast-driven depletion risk by {predicted_date}. "
        f"Suggested reorder: {suggested_quantity:.1f} from current stock {current_qty:.1f}."
    )


def _supplier_name(item: dict[str, Any], vendors_by_id: dict[str, str]) -> str | None:
    supplier_info = item.get("supplier_info")
    if isinstance(supplier_info, dict):
        name = supplier_info.get("name")
        if name:
            return str(name)
    vendor_id = item.get("vendor_id")
    if vendor_id:
        resolved = vendors_by_id.get(str(vendor_id))
        if resolved:
            return resolved
    return None


def _recommendation_signature(recommendations: list[dict[str, Any]]) -> str:
    canonical = "|".join(
        f"{row['prediction_id']}:{row['item_id']}:{row['suggested_quantity']}:{row['predicted_depletion_date']}:{row['confidence']}"
        for row in recommendations
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _recommendation_to_item_payload(recommendation: dict[str, Any]) -> dict[str, Any]:
    return {
        "inventory_item_id": recommendation["item_id"],
        "prediction_id": recommendation["prediction_id"],
        "name": recommendation["item_name"],
        "quantity": str(recommendation["suggested_quantity"]),
        "unit": recommendation.get("unit") or "unit",
        "estimated_price": (
            str(recommendation["estimated_price"])
            if recommendation.get("estimated_price") is not None
            else None
        ),
        "currency": recommendation.get("currency") or "USD",
        "priority": recommendation.get("priority") or "normal",
        "reason": recommendation.get("reason"),
        "source": "prediction",
        "is_purchased": False,
    }


def _first_currency(recommendations: list[dict[str, Any]]) -> str:
    for row in recommendations:
        currency = row.get("currency")
        if currency:
            return str(currency)
    return "USD"
