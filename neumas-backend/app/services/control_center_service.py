from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.control_center import (
    ControlCenterAction,
    ControlCenterDemandSummary,
    ControlCenterKPI,
    ControlCenterMarginSummary,
    ControlCenterSummary,
    ControlCenterSupplierSummary,
)
from app.services.decision_center_service import DecisionCenterService

logger = get_logger(__name__)


class ControlCenterService:
    """Build the operator Control Center payload from real tenant data."""

    def __init__(self) -> None:
        self._decision_center = DecisionCenterService()

    async def build_summary(self, tenant: TenantContext) -> ControlCenterSummary:
        if tenant.property_id is None:
            raise ValueError("property_id required for control center summary")

        client = await get_async_supabase_admin()
        org_id = str(tenant.org_id)
        property_id = str(tenant.property_id)

        alerts = await self._fetch_rows(
            client,
            "alerts",
            "id,alert_type,severity,title,body,metadata,created_at,state,item_id",
            organization_id=org_id,
            property_id=property_id,
            extra_eq={"state": "open"},
            order_by="created_at",
            desc=True,
            limit=50,
        )
        predictions = await self._fetch_rows(
            client,
            "predictions",
            "id,prediction_type,prediction_date,confidence,stockout_risk_level,item_id,inventory_item_id,features_used,predicted_value,predicted_depletion_date",
            organization_id=org_id,
            property_id=property_id,
            order_by="prediction_date",
            desc=False,
            limit=100,
        )
        shopping_lists = await self._fetch_rows(
            client,
            "shopping_lists",
            "id,status,name,total_estimated_cost,total_actual_cost,budget_limit,approved_at,updated_at,generation_params",
            organization_id=org_id,
            property_id=property_id,
            order_by="updated_at",
            desc=True,
            limit=50,
        )
        documents = await self._fetch_rows(
            client,
            "documents",
            "id,status,review_needed,review_reason,overall_confidence,created_at,total_amount,vendor_name",
            organization_id=org_id,
            property_id=property_id,
            order_by="created_at",
            desc=True,
            limit=50,
        )
        inventory = await self._fetch_rows(
            client,
            "inventory_items",
            "id,name,quantity,min_quantity,reorder_point,cost_per_unit,stock_status,updated_at,supplier_info,vendor_id",
            organization_id=org_id,
            property_id=property_id,
            order_by="updated_at",
            desc=True,
            limit=200,
        )
        vendor_alerts = await self._fetch_rows(
            client,
            "vendor_price_alerts",
            "id,severity,title,body,metadata,created_at,state",
            organization_id=org_id,
            property_id=property_id,
            extra_eq={"state": "open"},
            order_by="created_at",
            desc=True,
            limit=25,
            missing_ok=True,
        )

        decision_payload = None
        try:
            decision_payload = await self._decision_center.build(tenant)
        except Exception as e:
            logger.warning("Control center decision payload unavailable", error=str(e))

        demand = self._build_demand_summary(predictions, decision_payload)
        margin = self._build_margin_summary(alerts, shopping_lists, documents, decision_payload)
        supplier = self._build_supplier_summary(inventory, vendor_alerts)
        risks = self._build_risks(alerts, inventory)
        recommendations = self._build_recommendations(shopping_lists, decision_payload)
        approvals = self._build_open_approvals(shopping_lists)
        exceptions = self._build_exceptions(alerts, documents, vendor_alerts)
        recent_actions = self._build_recent_actions(shopping_lists, documents)

        kpis = self._build_kpis(
            margin=margin,
            demand=demand,
            supplier=supplier,
            exceptions=exceptions,
            approvals=approvals,
        )

        return ControlCenterSummary(
            generated_at=datetime.now(UTC),
            organization_id=org_id,
            property_id=property_id,
            kpis=kpis,
            risks=risks,
            recommendations=recommendations,
            open_approvals=approvals,
            exceptions=exceptions,
            demand_summary=demand,
            margin_summary=margin,
            supplier_summary=supplier,
            recent_actions=recent_actions,
        )

    async def _fetch_rows(
        self,
        client: Any,
        table: str,
        select: str,
        *,
        organization_id: str,
        property_id: str,
        order_by: str,
        desc: bool,
        limit: int,
        extra_eq: dict[str, Any] | None = None,
        missing_ok: bool = False,
    ) -> list[dict[str, Any]]:
        query = (
            client.table(table)
            .select(select)
            .eq("organization_id", organization_id)
            .eq("property_id", property_id)
        )
        for key, value in (extra_eq or {}).items():
            query = query.eq(key, value)
        try:
            response = await query.order(order_by, desc=desc).limit(limit).execute()
        except Exception as e:
            if missing_ok:
                logger.info("Optional control center source unavailable", table=table, error=str(e))
                return []
            raise
        return [row for row in (response.data or []) if isinstance(row, dict)]

    def _build_demand_summary(
        self,
        predictions: list[dict[str, Any]],
        decision_payload: Any | None,
    ) -> ControlCenterDemandSummary:
        confidences = [
            float(row["confidence"])
            for row in predictions
            if row.get("confidence") is not None
        ]
        risky = [
            row for row in predictions
            if str(row.get("stockout_risk_level") or "").lower() in {"critical", "urgent"}
        ]
        next_need = getattr(getattr(decision_payload, "ahead", None), "next_7_day_purchase_need", None)
        history_days = getattr(getattr(decision_payload, "ahead", None), "history_days_observed", 0) or 0
        learning_state = getattr(getattr(decision_payload, "ahead", None), "learning_state", None)
        return ControlCenterDemandSummary(
            forecast_confidence=round(sum(confidences) / len(confidences), 3) if confidences else None,
            stock_risk_count=len(risky),
            next_7_day_purchase_need=next_need,
            history_days_observed=int(history_days),
            learning_state=learning_state,
            evidence=[f"{len(predictions)} prediction rows", f"{len(risky)} critical/urgent stockout risks"],
        )

    def _build_margin_summary(
        self,
        alerts: list[dict[str, Any]],
        shopping_lists: list[dict[str, Any]],
        documents: list[dict[str, Any]],
        decision_payload: Any | None,
    ) -> ControlCenterMarginSummary:
        margin_at_risk = 0.0
        has_margin_signal = False
        for row in alerts:
            metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
            value = metadata.get("financial_impact") or metadata.get("margin_at_risk")
            if value is not None:
                margin_at_risk += float(value)
                has_margin_signal = True

        savings = None
        impact = getattr(decision_payload, "impact", None)
        if impact is not None and getattr(impact, "purchasing_variance", None) is not None:
            variance = float(impact.purchasing_variance)
            if variance < 0:
                savings = abs(variance)

        approved_spend = sum(
            float(row.get("total_estimated_cost") or 0)
            for row in shopping_lists
            if str(row.get("status")) in {"approved", "order_ready", "order_sent", "partially_received", "received"}
        )
        document_spend = sum(float(row.get("total_amount") or 0) for row in documents if row.get("total_amount") is not None)
        evidence = [
            f"{len(shopping_lists)} purchase plan rows",
            f"{len(documents)} invoice/document rows",
        ]
        if approved_spend:
            evidence.append(f"{approved_spend:.2f} approved/actioned purchase plan value")
        if document_spend:
            evidence.append(f"{document_spend:.2f} document value observed")

        return ControlCenterMarginSummary(
            food_cost_pct=None,
            margin_at_risk=round(margin_at_risk, 2) if has_margin_signal else None,
            savings_captured=savings,
            evidence=evidence,
        )

    def _build_supplier_summary(
        self,
        inventory: list[dict[str, Any]],
        vendor_alerts: list[dict[str, Any]],
    ) -> ControlCenterSupplierSummary:
        supplier_ids: set[str] = set()
        supplier_names: set[str] = set()
        for item in inventory:
            if item.get("vendor_id"):
                supplier_ids.add(str(item["vendor_id"]))
            supplier_info = item.get("supplier_info")
            if isinstance(supplier_info, dict) and supplier_info.get("name"):
                supplier_names.add(str(supplier_info["name"]))
        supplier_count = len(supplier_ids | supplier_names)
        return ControlCenterSupplierSummary(
            supplier_otif=None,
            supplier_count=supplier_count,
            price_alert_count=len(vendor_alerts),
            evidence=[
                f"{supplier_count} suppliers observed from inventory metadata",
                f"{len(vendor_alerts)} open vendor price alerts",
            ],
        )

    def _build_risks(
        self,
        alerts: list[dict[str, Any]],
        inventory: list[dict[str, Any]],
    ) -> list[ControlCenterAction]:
        risks: list[ControlCenterAction] = []
        for alert in alerts[:8]:
            risks.append(
                ControlCenterAction(
                    id=str(alert.get("id") or uuid4()),
                    title=str(alert.get("title") or "Open risk"),
                    category=str(alert.get("alert_type") or "alert"),
                    priority=self._priority_from_severity(alert.get("severity")),
                    what_changed=str(alert.get("body") or alert.get("title") or "An operating signal changed."),
                    impact=self._impact_from_metadata(alert.get("metadata")),
                    evidence=[f"Alert severity: {alert.get('severity') or 'unknown'}"],
                    recommended_action="Review the exception and decide whether to approve, snooze, or resolve it.",
                    approval_required=str(alert.get("severity") or "").lower() in {"critical", "high"},
                    href="/dashboard/exceptions",
                    status="open",
                    metadata={"source": "alerts"},
                )
            )

        for item in inventory:
            if str(item.get("stock_status") or "") not in {"low_stock", "out_of_stock"}:
                continue
            name = str(item.get("name") or "Inventory item")
            quantity = item.get("quantity")
            risks.append(
                ControlCenterAction(
                    id=str(item.get("id") or uuid4()),
                    title=f"{name} at risk",
                    category="inventory",
                    priority="P0" if str(item.get("stock_status")) == "out_of_stock" else "P1",
                    what_changed=f"{name} is marked {str(item.get('stock_status')).replace('_', ' ')}.",
                    impact=None,
                    evidence=[f"On-hand quantity: {quantity}" if quantity is not None else "Inventory row has no quantity"],
                    recommended_action="Review inventory and create or update the procurement recommendation if needed.",
                    approval_required=False,
                    href="/dashboard/inventory",
                    status="open",
                    metadata={"source": "inventory_items"},
                )
            )
            if len(risks) >= 12:
                break
        return risks

    def _build_recommendations(
        self,
        shopping_lists: list[dict[str, Any]],
        decision_payload: Any | None,
    ) -> list[ControlCenterAction]:
        recommendations: list[ControlCenterAction] = []
        for row in shopping_lists:
            status = str(row.get("status") or "")
            if status not in {"recommended", "awaiting_approval", "modified", "approved", "order_ready"}:
                continue
            estimate = row.get("total_estimated_cost")
            recommendations.append(
                ControlCenterAction(
                    id=str(row.get("id") or uuid4()),
                    title=str(row.get("name") or "Procurement recommendation"),
                    category="procurement",
                    priority="P0" if status in {"recommended", "awaiting_approval", "modified"} else "P1",
                    what_changed=f"Purchase plan is currently {status.replace('_', ' ')}.",
                    impact=f"{float(estimate):.2f} estimated procurement need" if estimate is not None else None,
                    evidence=["Existing shopping list lifecycle row"],
                    recommended_action="Open the recommendation and approve, modify, or receive the plan.",
                    approval_required=status in {"recommended", "awaiting_approval", "modified"},
                    href="/dashboard/procurement/recommendations",
                    status=status,
                    metadata={"source": "shopping_lists"},
                )
            )

        next_best = getattr(decision_payload, "next_best_action", None)
        if next_best is not None and not recommendations:
            recommendations.append(
                ControlCenterAction(
                    id="next-best-action",
                    title=str(next_best.title),
                    category=str(next_best.action_type),
                    priority="P1",
                    what_changed=str(next_best.detail),
                    impact=None,
                    evidence=["Existing decision-center service"],
                    recommended_action=str(next_best.cta_label),
                    approval_required=False,
                    href=str(next_best.cta_href),
                    status="open",
                    metadata={"source": "decision_center"},
                )
            )
        return recommendations

    def _build_open_approvals(self, shopping_lists: list[dict[str, Any]]) -> list[ControlCenterAction]:
        approvals: list[ControlCenterAction] = []
        for row in shopping_lists:
            status = str(row.get("status") or "")
            if status not in {"recommended", "awaiting_approval", "modified"}:
                continue
            estimate = row.get("total_estimated_cost")
            approvals.append(
                ControlCenterAction(
                    id=str(row.get("id") or uuid4()),
                    title=str(row.get("name") or "Purchase plan awaiting approval"),
                    category="approval",
                    priority="P0",
                    what_changed=f"Recommendation moved to {status.replace('_', ' ')}.",
                    impact=f"{float(estimate):.2f} estimated spend" if estimate is not None else None,
                    evidence=["Shopping list status requires operator decision"],
                    recommended_action="Approve, modify, or reject the recommendation.",
                    approval_required=True,
                    href="/dashboard/procurement/recommendations",
                    status=status,
                    metadata={"source": "shopping_lists"},
                )
            )
        return approvals

    def _build_exceptions(
        self,
        alerts: list[dict[str, Any]],
        documents: list[dict[str, Any]],
        vendor_alerts: list[dict[str, Any]],
    ) -> list[ControlCenterAction]:
        exceptions: list[ControlCenterAction] = []
        for doc in documents:
            if not doc.get("review_needed"):
                continue
            exceptions.append(
                ControlCenterAction(
                    id=str(doc.get("id") or uuid4()),
                    title="Invoice review required",
                    category="invoice",
                    priority="P0",
                    what_changed=str(doc.get("review_reason") or "Extraction confidence requires operator review."),
                    impact=f"{float(doc['total_amount']):.2f} document value" if doc.get("total_amount") is not None else None,
                    evidence=[f"Confidence: {doc.get('overall_confidence')}" if doc.get("overall_confidence") is not None else "Document flagged for review"],
                    recommended_action="Review extracted invoice fields before using them for procurement intelligence.",
                    approval_required=True,
                    href="/dashboard/invoices",
                    status=str(doc.get("status") or "review_needed"),
                    metadata={"source": "documents"},
                )
            )
        for alert in [*alerts, *vendor_alerts]:
            exceptions.append(
                ControlCenterAction(
                    id=str(alert.get("id") or uuid4()),
                    title=str(alert.get("title") or "Open exception"),
                    category=str(alert.get("alert_type") or "exception"),
                    priority=self._priority_from_severity(alert.get("severity")),
                    what_changed=str(alert.get("body") or alert.get("title") or "An exception is open."),
                    impact=self._impact_from_metadata(alert.get("metadata")),
                    evidence=[f"Source state: {alert.get('state') or 'open'}"],
                    recommended_action="Investigate and resolve or route for approval.",
                    approval_required=str(alert.get("severity") or "").lower() in {"critical", "high"},
                    href="/dashboard/exceptions",
                    status="open",
                    metadata={"source": "alerts"},
                )
            )
        return exceptions[:20]

    def _build_recent_actions(
        self,
        shopping_lists: list[dict[str, Any]],
        documents: list[dict[str, Any]],
    ) -> list[ControlCenterAction]:
        recent: list[ControlCenterAction] = []
        cutoff = datetime.now(UTC) - timedelta(days=14)
        for row in shopping_lists:
            updated_at = self._parse_dt(row.get("updated_at"))
            if updated_at and updated_at < cutoff:
                continue
            status = str(row.get("status") or "updated")
            recent.append(
                ControlCenterAction(
                    id=str(row.get("id") or uuid4()),
                    title=str(row.get("name") or "Purchase plan updated"),
                    category="procurement",
                    priority="P2",
                    what_changed=f"Purchase plan status is {status.replace('_', ' ')}.",
                    impact=f"{float(row['total_estimated_cost']):.2f} estimated" if row.get("total_estimated_cost") is not None else None,
                    evidence=["Shopping list lifecycle update"],
                    recommended_action="Verify the latest state is correct.",
                    approval_required=status in {"recommended", "awaiting_approval", "modified"},
                    href="/dashboard/procurement/recommendations",
                    status=status,
                    metadata={"source": "shopping_lists"},
                )
            )
        for doc in documents[:5]:
            recent.append(
                ControlCenterAction(
                    id=str(doc.get("id") or uuid4()),
                    title="Invoice signal captured",
                    category="invoice",
                    priority="P2",
                    what_changed=f"Document is {str(doc.get('status') or 'available').replace('_', ' ')}.",
                    impact=f"{float(doc['total_amount']):.2f} document value" if doc.get("total_amount") is not None else None,
                    evidence=["Document row"],
                    recommended_action="Review invoice evidence if confidence or mapping is incomplete.",
                    approval_required=bool(doc.get("review_needed")),
                    href="/dashboard/invoices",
                    status=str(doc.get("status") or "available"),
                    metadata={"source": "documents"},
                )
            )
        return recent[:12]

    def _build_kpis(
        self,
        *,
        margin: ControlCenterMarginSummary,
        demand: ControlCenterDemandSummary,
        supplier: ControlCenterSupplierSummary,
        exceptions: list[ControlCenterAction],
        approvals: list[ControlCenterAction],
    ) -> list[ControlCenterKPI]:
        return [
            ControlCenterKPI(
                key="food_cost_pct",
                label="Food Cost %",
                value=margin.food_cost_pct,
                unit="%",
                status="unknown" if margin.food_cost_pct is None else "neutral",
                evidence=margin.evidence,
            ),
            ControlCenterKPI(
                key="margin_at_risk",
                label="Margin at Risk",
                value=margin.margin_at_risk,
                unit="currency",
                status="unknown" if margin.margin_at_risk is None else "risk",
                evidence=margin.evidence,
            ),
            ControlCenterKPI(
                key="procurement_need_7d",
                label="7-Day Procurement Need",
                value=demand.next_7_day_purchase_need,
                unit="currency",
                status="unknown" if demand.next_7_day_purchase_need is None else "watch",
                evidence=demand.evidence,
            ),
            ControlCenterKPI(
                key="savings_captured",
                label="Savings Captured",
                value=margin.savings_captured,
                unit="currency",
                status="unknown" if margin.savings_captured is None else "good",
                evidence=margin.evidence,
            ),
            ControlCenterKPI(
                key="forecast_confidence",
                label="Forecast Confidence",
                value=demand.forecast_confidence,
                unit="percent_ratio",
                status="unknown" if demand.forecast_confidence is None else "good",
                evidence=demand.evidence,
            ),
            ControlCenterKPI(
                key="open_exceptions",
                label="Open Exceptions",
                value=len(exceptions),
                unit="count",
                status="good" if not exceptions else "risk",
                evidence=[f"{len(exceptions)} open exception rows"],
            ),
            ControlCenterKPI(
                key="pos_awaiting_action",
                label="POs Awaiting Action",
                value=None,
                unit="count",
                status="unknown",
                evidence=["No purchase order table exists yet; approval queue is reported separately."],
            ),
            ControlCenterKPI(
                key="supplier_otif",
                label="Supplier OTIF",
                value=supplier.supplier_otif,
                unit="%",
                status="unknown",
                evidence=supplier.evidence,
            ),
        ]

    def _priority_from_severity(self, severity: Any) -> str:
        sev = str(severity or "").lower()
        if sev in {"critical", "high"}:
            return "P0"
        if sev in {"medium", "warning"}:
            return "P1"
        return "P2"

    def _impact_from_metadata(self, metadata: Any) -> str | None:
        if not isinstance(metadata, dict):
            return None
        value = metadata.get("financial_impact") or metadata.get("margin_at_risk") or metadata.get("estimated_cost")
        if value is None:
            return None
        return f"{float(value):.2f} estimated impact"

    def _parse_dt(self, value: Any) -> datetime | None:
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except Exception:
            return None
