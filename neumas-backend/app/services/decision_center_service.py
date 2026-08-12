from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.decision_center import (
    DecisionActionCard,
    DecisionAheadState,
    DecisionCenterResponse,
    DecisionImpactState,
    DecisionLatestActivity,
    DecisionNextBestAction,
)
from app.services.impact_service import ImpactService
from app.services.purchase_summary_service import PurchaseSummaryService

logger = get_logger(__name__)


class DecisionCenterService:
    """Assemble one canonical operator-facing decision payload."""

    def __init__(self) -> None:
        self._impact = ImpactService()
        self._purchase_summary = PurchaseSummaryService()

    async def build(self, tenant: TenantContext, *, workspace_experience: str = "FNB") -> DecisionCenterResponse:
        client = await get_async_supabase_admin()
        property_id = str(tenant.property_id) if tenant.property_id else None
        org_id = str(tenant.org_id)

        scans = await self._fetch_rows(
            client,
            "scans",
            "id,status,processed_results,items_detected,created_at",
            organization_id=org_id,
            property_id=property_id,
            order_by="created_at",
            desc=True,
            limit=5,
        )
        alerts = await self._fetch_rows(
            client,
            "alerts",
            "id,alert_type,severity,title,body,metadata,created_at,state,item_id",
            organization_id=org_id,
            property_id=property_id,
            extra_eq={"state": "open"},
            order_by="created_at",
            desc=True,
            limit=30,
        )
        documents = await self._fetch_rows(
            client,
            "documents",
            "id,status,review_needed,review_reason,overall_confidence,created_at",
            organization_id=org_id,
            property_id=property_id,
            extra_eq={"review_needed": True},
            order_by="created_at",
            desc=True,
            limit=20,
        )
        predictions = await self._fetch_rows(
            client,
            "predictions",
            "id,prediction_type,prediction_date,confidence,stockout_risk_level,item_id,inventory_item_id,features_used",
            organization_id=org_id,
            property_id=property_id,
            order_by="prediction_date",
            desc=False,
            limit=30,
        )
        shopping_lists = await self._fetch_rows(
            client,
            "shopping_lists",
            "id,status,total_estimated_cost,total_actual_cost,updated_at,generation_params",
            organization_id=org_id,
            property_id=property_id,
            order_by="updated_at",
            desc=True,
            limit=15,
        )
        organization = await self._fetch_single(
            client,
            "organizations",
            "activation_milestones,settings",
            id=org_id,
        )

        action_queue = self._build_action_queue(
            workspace_experience=workspace_experience,
            documents=documents,
            alerts=alerts,
            shopping_lists=shopping_lists,
            organization=organization or {},
        )
        next_best_action = self._pick_next_best_action(action_queue, workspace_experience)
        latest_activity = await self._build_latest_activity(tenant, scans)
        ahead = self._build_ahead_state(
            workspace_experience=workspace_experience,
            alerts=alerts,
            predictions=predictions,
            shopping_lists=shopping_lists,
        )
        impact = await self._build_impact_state(
            tenant=tenant,
            workspace_experience=workspace_experience,
        )

        return DecisionCenterResponse(
            generated_at=datetime.now(UTC),
            workspace_experience=workspace_experience,
            action_queue=action_queue,
            latest_activity=latest_activity,
            ahead=ahead,
            impact=impact,
            next_best_action=next_best_action,
        )

    async def _fetch_rows(
        self,
        client: Any,
        table: str,
        select: str,
        *,
        organization_id: str,
        property_id: str | None,
        extra_eq: dict[str, Any] | None = None,
        order_by: str,
        desc: bool,
        limit: int,
    ) -> list[dict[str, Any]]:
        query = client.table(table).select(select).eq("organization_id", organization_id)
        if property_id and table != "organizations":
            query = query.eq("property_id", property_id)
        for key, value in (extra_eq or {}).items():
            query = query.eq(key, value)
        response = await query.order(order_by, desc=desc).limit(limit).execute()
        return [row for row in (response.data or []) if isinstance(row, dict)]

    async def _fetch_single(self, client: Any, table: str, select: str, **filters: str) -> dict[str, Any] | None:
        query = client.table(table).select(select)
        for key, value in filters.items():
            query = query.eq(key, value)
        response = await query.limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None

    def _build_action_queue(
        self,
        *,
        workspace_experience: str,
        documents: list[dict[str, Any]],
        alerts: list[dict[str, Any]],
        shopping_lists: list[dict[str, Any]],
        organization: dict[str, Any],
    ) -> list[DecisionActionCard]:
        queue: list[DecisionActionCard] = []
        review_count = len(documents)
        if review_count:
            queue.append(
                DecisionActionCard(
                    priority="P0",
                    action_type="review_required",
                    title="Review invoice",
                    detail=f"{review_count} document(s) still need extraction confirmation.",
                    value=f"{review_count} pending",
                    confidence=None,
                    cta_label="Open review queue",
                    cta_href="/dashboard/documents",
                )
            )

        critical_stock = [
            alert for alert in alerts if str(alert.get("alert_type")) in {"predicted_stockout", "out_of_stock"}
        ]
        if critical_stock:
            label = "Open use-soon queue" if workspace_experience == "HOUSEHOLD" else "Review stockout actions"
            href = "/dashboard/alerts"
            queue.append(
                DecisionActionCard(
                    priority="P0",
                    action_type="critical_stockout",
                    title="Stock risk needs attention" if workspace_experience != "HOUSEHOLD" else "Pantry risk needs attention",
                    detail=critical_stock[0].get("title") or "Items are projected to run low soon.",
                    value=f"{len(critical_stock)} alert(s)",
                    confidence=None,
                    cta_label=label,
                    cta_href=href,
                )
            )

        approval_lists = [
            row for row in shopping_lists if str(row.get("status")) in {"recommended", "awaiting_approval", "modified"}
        ]
        if approval_lists:
            top = approval_lists[0]
            value = top.get("total_estimated_cost")
            queue.append(
                DecisionActionCard(
                    priority="P0",
                    action_type="reorder_approval",
                    title="Approve reorder" if workspace_experience != "HOUSEHOLD" else "Review smart list",
                    detail="A durable purchase plan is waiting for an operator decision.",
                    value=f"SGD {float(value):.2f} estimated" if value is not None else None,
                    confidence=None,
                    cta_label="Open shopping",
                    cta_href="/dashboard/shopping",
                )
            )

        delivery_lists = [
            row
            for row in shopping_lists
            if str(row.get("status")) in {"approved", "order_ready", "order_placed_manually", "order_sent", "partially_received"}
        ]
        if delivery_lists:
            queue.append(
                DecisionActionCard(
                    priority="P1",
                    action_type="delivery_confirmation",
                    title="Confirm delivery" if workspace_experience != "HOUSEHOLD" else "Confirm purchase",
                    detail="A purchase plan is active and should be confirmed once goods are received.",
                    value=None,
                    confidence=None,
                    cta_label="Update shopping status",
                    cta_href="/dashboard/shopping",
                )
            )

        low_signal = next((alert for alert in alerts if str(alert.get("alert_type")) == "no_recent_scan"), None)
        if low_signal:
            queue.append(
                DecisionActionCard(
                    priority="P2",
                    action_type="next_evidence_cycle",
                    title="Upload next evidence cycle",
                    detail=str(low_signal.get("body") or "A fresh purchase document will keep your baseline current."),
                    value=None,
                    confidence=None,
                    cta_label="Upload receipt",
                    cta_href="/dashboard/scans/new",
                )
            )

        milestones = organization.get("activation_milestones") or {}
        if not bool(milestones.get("first_document_uploaded")):
            queue.append(
                DecisionActionCard(
                    priority="P2",
                    action_type="activation_task",
                    title="Upload first evidence cycle" if workspace_experience != "HOUSEHOLD" else "Scan your first receipt",
                    detail="Neumas needs one real purchase document to continue building your baseline.",
                    value=None,
                    confidence=None,
                    cta_label="Upload receipt",
                    cta_href="/dashboard/scans/new",
                )
            )

        priority_rank = {"P0": 0, "P1": 1, "P2": 2}
        action_rank = {
            "review_required": 0,
            "critical_stockout": 1,
            "reorder_approval": 2,
            "delivery_confirmation": 3,
            "next_evidence_cycle": 4,
            "activation_task": 5,
        }
        return sorted(
            queue,
            key=lambda card: (
                priority_rank[card.priority],
                action_rank.get(card.action_type, 99),
                card.title,
            ),
        )[:6]

    def _pick_next_best_action(
        self,
        action_queue: list[DecisionActionCard],
        workspace_experience: str,
    ) -> DecisionNextBestAction:
        if action_queue:
            top = action_queue[0]
            return DecisionNextBestAction(
                action_type=top.action_type,
                title=top.title,
                detail=top.detail,
                cta_label=top.cta_label,
                cta_href=top.cta_href,
            )
        return DecisionNextBestAction(
            action_type="no_action",
            title="Upload your next purchase document" if workspace_experience != "HOUSEHOLD" else "Scan your next receipt",
            detail="Neumas will keep learning as new evidence arrives.",
            cta_label="Open scans",
            cta_href="/dashboard/scans/new",
        )

    async def _build_latest_activity(self, tenant: TenantContext, scans: list[dict[str, Any]]) -> DecisionLatestActivity | None:
        latest = scans[0] if scans else None
        if not latest:
            return None
        processed = latest.get("processed_results") or {}
        stage_details = processed.get("stage_details") or {}
        receipt_meta = processed.get("receipt_metadata") or {}
        items = list(processed.get("items") or [])
        downstream = stage_details.get("downstream") or {}
        document_stage = stage_details.get("document_review") or {}
        canonical_stage = stage_details.get("canonicalization") or {}
        receipt_total = (
            receipt_meta.get("receipt_total")
            if receipt_meta.get("receipt_total") not in {None, ""}
            else receipt_meta.get("total")
        )
        items_updated = len(items) or int(latest.get("items_detected") or 0) or None
        detail = (
            "Inventory updated successfully."
            if latest.get("status") in {"inventory_posted", "completed", "completed_with_partial_analysis", "partial_failed"}
            else "Latest workflow is still processing."
        )
        if latest.get("status") == "inventory_posted" and not downstream:
            detail = "Inventory updated. Downstream analysis is still catching up."
        purchase_summary = None
        if latest.get("id"):
            purchase_summary = await self._purchase_summary.get_latest_summary(
                tenant,
                scan_id=UUID(str(latest["id"])),
            )
        return DecisionLatestActivity(
            title="Latest workflow",
            detail=detail,
            status=str(latest.get("status") or "unknown"),
            scan_id=str(latest.get("id") or ""),
            document_count=int(document_stage.get("document_count") or 0) or None,
            items_updated=(purchase_summary or {}).get("products_added") or items_updated,
            supplier_name=(purchase_summary or {}).get("supplier_name") or receipt_meta.get("vendor_name"),
            purchase_date=(purchase_summary or {}).get("purchase_date"),
            invoice_total=float(receipt_total) if receipt_total not in {None, ""} else None,
            categories_identified=(purchase_summary or {}).get("categories_identified") or [],
            canonicalized_count=(purchase_summary or {}).get("canonicalized_count"),
            unresolved_count=(purchase_summary or {}).get("unresolved_count"),
            price_observations_created=(purchase_summary or {}).get("price_observations_created"),
            average_extraction_confidence=(purchase_summary or {}).get("average_extraction_confidence"),
            canonicalization_status=str(canonical_stage.get("status") or "unknown"),
            downstream_status=str(downstream.get("status") or ("pending" if latest.get("status") == "inventory_posted" else "unknown")),
        )

    def _build_ahead_state(
        self,
        *,
        workspace_experience: str,
        alerts: list[dict[str, Any]],
        predictions: list[dict[str, Any]],
        shopping_lists: list[dict[str, Any]],
    ) -> DecisionAheadState:
        stock_risk_count = sum(
            1 for alert in alerts if str(alert.get("alert_type")) in {"predicted_stockout", "out_of_stock", "low_stock"}
        )
        confidences = [float(row.get("confidence") or 0) for row in predictions if row.get("confidence") is not None]
        purchase_need = next(
            (
                float(row.get("total_estimated_cost"))
                for row in shopping_lists
                if row.get("total_estimated_cost") is not None and str(row.get("status")) in {"recommended", "awaiting_approval", "approved", "modified"}
            ),
            None,
        )
        if not predictions:
            learning_state = (
                "Neumas is learning your household rhythm."
                if workspace_experience == "HOUSEHOLD"
                else "Neumas is building your operating baseline."
            )
        else:
            learning_state = None
        return DecisionAheadState(
            stock_risk_count=stock_risk_count,
            next_7_day_purchase_need=purchase_need,
            waste_risk_count=None,
            forecast_confidence=(sum(confidences) / len(confidences)) if confidences else None,
            learning_state=learning_state,
        )

    async def _build_impact_state(
        self,
        *,
        tenant: TenantContext,
        workspace_experience: str,
    ) -> DecisionImpactState:
        summary = await self._impact.get_impact_summary(
            tenant,
            days=30,
            workspace_experience=workspace_experience,
        )
        metrics = summary.get("metrics") or []
        rollup = summary.get("summary") or {}
        return DecisionImpactState(
            mode=str(summary.get("mode") or "baseline"),
            headline=str(summary.get("headline") or "Building your operating baseline."),
            metrics=metrics,
            methodology_note="Modeled metrics are labeled explicitly and only appear when evidence exists.",
            purchasing_variance=rollup.get("observed_price_variance"),
            decisions_automated=rollup.get("automated_workflow_actions"),
        )
