from __future__ import annotations

import json
from typing import Any

from app.api.deps import TenantContext
from app.core.constants import estimate_llm_cost
from app.core.logging import get_logger
from app.db.repositories.usage_metering import UsageMeteringRepository
from app.services.context_builder import build_property_context
from app.services.copilot_tool_service import CopilotToolService
from app.services.decision_center_service import DecisionCenterService
from app.services.impact_service import ImpactService
from app.services.llm_failover import get_completion_with_failover
from app.services.prediction_outcome_service import PredictionOutcomeService
from app.services.retrieval_service import search_documents

logger = get_logger(__name__)


class OperatorCopilotService:
    """Grounded, read-only operator copilot over the existing operational loop."""

    def __init__(self) -> None:
        self._tools = CopilotToolService()
        self._decision_center = DecisionCenterService()
        self._impact = ImpactService()
        self._prediction_outcomes = PredictionOutcomeService()
        self._usage = UsageMeteringRepository()

    async def answer(
        self,
        tenant: TenantContext,
        *,
        question: str,
        workspace_experience: str = "FNB",
    ) -> dict[str, Any]:
        normalized = " ".join(question.lower().split())
        facts, citations = await self._ground_question(
            tenant,
            normalized=normalized,
            workspace_experience=workspace_experience,
        )
        if not facts:
            return {
                "answer": "Neumas could not verify enough tenant-scoped evidence to answer that safely yet.",
                "citations": [],
                "mode": "fallback",
            }

        synthesized = await self._synthesize(
            tenant,
            question=question,
            workspace_experience=workspace_experience,
            facts=facts,
            citations=citations,
        )
        return synthesized

    async def _ground_question(
        self,
        tenant: TenantContext,
        *,
        normalized: str,
        workspace_experience: str,
    ) -> tuple[list[str], list[dict[str, str]]]:
        facts: list[str] = []
        citations: list[dict[str, str]] = []

        if any(token in normalized for token in ["attention today", "needs my attention", "what should i buy", "running low", "use soon"]):
            decision_center = await self._decision_center.build(tenant, workspace_experience=workspace_experience)
            for action in decision_center.action_queue[:4]:
                facts.append(f"Action: {action.title}. Detail: {action.detail}. CTA: {action.cta_label}.")
                citations.append({"kind": "decision", "id": action.action_type, "label": action.title, "href": action.cta_href})
            return facts, citations

        if "run out" in normalized or "stock" in normalized and "week" in normalized:
            summary = await self._tools.summarize_outlet_risk(
                tenant,
                type("RiskInput", (), {"property_id": tenant.property_id, "include_snoozed": False})(),
            )
            facts.append(
                f"Open alerts: {summary.open_alerts}. Critical alerts: {summary.critical_alerts}. Low stock items: {summary.low_stock_items}. Overall risk: {summary.overall_risk}."
            )
            citations.append({"kind": "alerts", "id": str(tenant.property_id), "label": "Alert summary", "href": "/dashboard/alerts"})
            return facts, citations

        if "recommending this reorder" in normalized or "waiting for approval" in normalized:
            decision_center = await self._decision_center.build(tenant, workspace_experience=workspace_experience)
            for action in decision_center.action_queue:
                if action.action_type == "reorder_approval":
                    facts.append(f"Reorder decision: {action.detail}. Value: {action.value or 'not available'}.")
                    citations.append({"kind": "reorder", "id": action.action_type, "label": action.title, "href": action.cta_href})
            return facts, citations

        if "supplier prices increased" in normalized or "price" in normalized and "increased" in normalized:
            comparison = await self._tools.compare_vendors(
                tenant,
                type("CompareInput", (), {"item_name": "", "vendor_ids": None})(),
            )
            if comparison.vendors:
                for row in comparison.vendors[:4]:
                    facts.append(
                        f"Vendor {row.vendor_name}: last price {row.last_price}, 30-day average {row.avg_price_30d}, change {row.price_change_pct} percent."
                    )
                    citations.append({"kind": "vendor", "id": row.vendor_id, "label": row.vendor_name, "href": "/dashboard/vendors"})
            return facts, citations

        if "after yesterday" in normalized or "invoice" in normalized:
            docs = await search_documents(tenant, " ", limit=3)
            for row in docs:
                facts.append(
                    f"Document {row.get('id')} from {row.get('created_at')} vendor {row.get('raw_vendor_name') or 'unknown'} status {row.get('status')}."
                )
                citations.append({"kind": "document", "id": str(row.get("id")), "label": row.get("raw_vendor_name") or "Document", "href": "/dashboard/documents"})
            return facts, citations

        if "why is inventory quantity" in normalized:
            item_name = normalized.split("quantity", 1)[-1].strip() or ""
            docs = await search_documents(tenant, item_name, limit=1)
            ctx = await build_property_context(tenant, include_predictions=True)
            facts.append(f"Property context: {json.dumps(ctx)[:1000]}")
            for row in docs:
                citations.append({"kind": "document", "id": str(row.get("id")), "label": row.get("raw_vendor_name") or "Document", "href": "/dashboard/documents"})
            return facts, citations

        if "accurate have forecasts" in normalized or "forecast accuracy" in normalized:
            summary = await self._prediction_outcomes.summarize(tenant)
            facts.append(
                f"Prediction sample size {summary.get('sample_size')}. Forecast accuracy {summary.get('forecast_accuracy')}. Confidence calibration {summary.get('confidence_calibration')}. Acceptance rate {summary.get('acceptance_rate')}."
            )
            citations.append({"kind": "prediction", "id": str(tenant.property_id), "label": "Prediction outcomes", "href": "/dashboard/predictions"})
            return facts, citations

        impact = await self._impact.get_impact_summary(tenant, workspace_experience=workspace_experience)
        facts.append(f"Impact summary: {json.dumps(impact.get('summary') or {})}")
        citations.append({"kind": "impact", "id": str(tenant.property_id), "label": "Impact summary", "href": "/dashboard"})
        return facts, citations

    async def _synthesize(
        self,
        tenant: TenantContext,
        *,
        question: str,
        workspace_experience: str,
        facts: list[str],
        citations: list[dict[str, str]],
    ) -> dict[str, Any]:
        fallback = {
            "answer": " ".join(facts[:3]),
            "citations": citations[:5],
            "mode": "fallback",
        }
        try:
            payload = {
                "workspace_experience": workspace_experience,
                "question": question,
                "facts": facts[:12],
                "citations": citations[:8],
                "rules": [
                    "Use only the supplied facts.",
                    "If the facts are insufficient, say that directly.",
                    "Do not claim actions were sent or completed unless the facts say so.",
                    "Return valid JSON with keys answer and citations.",
                ],
            }
            completion = await get_completion_with_failover(
                system_prompt="You are the Neumas Operator Copilot. Answer operational questions only from supplied facts. Return only JSON.",
                user_content=json.dumps(payload),
                is_vision=False,
                metadata={"feature": "operator_copilot"},
            )
            text = str(completion.get("text") or "").strip()
            parsed = json.loads(text[text.find("{"): text.rfind("}") + 1])
            answer = str(parsed.get("answer") or "").strip()
            result = {
                "answer": answer or fallback["answer"],
                "citations": parsed.get("citations") or citations[:5],
                "mode": "llm",
            }
            model = str(completion.get("model") or "")
            await self._usage.record(
                tenant,
                feature="operator_copilot",
                event_type="llm_call",
                model=model or None,
                cost_usd=estimate_llm_cost(model, 0, 0) if model else 0.0,
                metadata={"question": question[:200], "citation_count": len(citations)},
            )
            return result
        except Exception as exc:
            logger.warning("Operator copilot synthesis fell back", error=str(exc))
            await self._usage.record(
                tenant,
                feature="operator_copilot",
                event_type="fallback",
                metadata={"question": question[:200], "citation_count": len(citations)},
            )
            return fallback
