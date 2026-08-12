from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.services.impact_service import ImpactService

logger = get_logger(__name__)


class ExecutiveBriefingService:
    """Summarize recent audit activity into three executive bullets."""

    _SETTINGS_KEY = "executive_briefing_cache"

    def __init__(self) -> None:
        self._impact = ImpactService()

    async def get_briefing(
        self,
        tenant: TenantContext,
        days: int = 7,
        *,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        if not force_refresh:
            cached = await self._read_cached_briefing(client, tenant, days)
            if cached is not None:
                return cached

        since = (datetime.now(UTC) - timedelta(days=days)).isoformat()

        query = (
            client.table("audit_logs")
            .select("action,resource_type,metadata,created_at")
            .eq("organization_id", str(tenant.org_id))
            .gte("created_at", since)
            .order("created_at", desc=True)
            .limit(200)
        )
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))

        response = await query.execute()
        logs = response.data or []
        impact = await self._impact.get_impact_summary(tenant, days=30)
        bullets = await self._llm_summary(logs, days, impact=impact)
        payload = {
            "period_days": days,
            "generated_at": datetime.now(UTC).isoformat(),
            "bullets": bullets[:3],
            "log_count": len(logs),
        }
        await self._write_cached_briefing(client, tenant, payload)
        return payload

    async def _read_cached_briefing(
        self,
        client: Any,
        tenant: TenantContext,
        days: int,
    ) -> dict[str, Any] | None:
        response = await (
            client.table("organizations")
            .select("settings")
            .eq("id", str(tenant.org_id))
            .limit(1)
            .execute()
        )
        rows = response.data or []
        settings = rows[0].get("settings") if rows else {}
        cache = settings.get(self._SETTINGS_KEY) if isinstance(settings, dict) else None
        if not isinstance(cache, dict):
            return None

        property_key = str(tenant.property_id or "org")
        cached = cache.get(property_key)
        if not isinstance(cached, dict):
            return None

        generated_at_raw = cached.get("generated_at")
        if not generated_at_raw:
            return None
        try:
            generated_at = datetime.fromisoformat(str(generated_at_raw).replace("Z", "+00:00"))
        except ValueError:
            return None
        if generated_at < datetime.now(UTC) - timedelta(hours=6):
            return None
        if int(cached.get("period_days") or 0) != days:
            return None
        return cached

    async def _write_cached_briefing(
        self,
        client: Any,
        tenant: TenantContext,
        payload: dict[str, Any],
    ) -> None:
        response = await (
            client.table("organizations")
            .select("settings")
            .eq("id", str(tenant.org_id))
            .limit(1)
            .execute()
        )
        rows = response.data or []
        settings = dict(rows[0].get("settings") or {}) if rows else {}
        cache = dict(settings.get(self._SETTINGS_KEY) or {})
        cache[str(tenant.property_id or "org")] = payload
        settings[self._SETTINGS_KEY] = cache
        await client.table("organizations").update({"settings": settings}).eq("id", str(tenant.org_id)).execute()

    def _fallback_bullets(self, logs: list[dict[str, Any]], days: int, impact: dict[str, Any] | None = None) -> list[str]:
        if not logs:
            return [
                f"No audited activity was recorded in the last {days} days.",
                "Inventory workflows were quiet, so no new operational risks were inferred.",
                "Run a fresh scan or forecast to refresh the executive narrative.",
            ]

        actions = Counter(str(log.get("action") or "unknown") for log in logs)
        resources = Counter(str(log.get("resource_type") or "unknown") for log in logs)
        scan_failures = sum(
            1 for log in logs if str(log.get("action") or "").startswith("scan.") and "fail" in str(log.get("action"))
        )
        reorder_events = sum(
            1 for log in logs if str(log.get("action") or "").startswith(("reorder.", "shopping."))
        )

        top_actions = ", ".join(f"{name} ({count})" for name, count in actions.most_common(3))
        busiest_resource = resources.most_common(1)[0][0] if resources else "operations"
        bullets = [
            f"{len(logs)} audited actions landed in the last {days} days, led by {top_actions or 'normal operations'}.",
            f"The busiest workflow was {busiest_resource}, with {reorder_events} reorder and shopping actions recorded.",
            f"Operational friction stayed at {scan_failures} scan failures across the same window.",
        ]
        impact_summary = (impact or {}).get("summary") or {}
        documents_processed = int(impact_summary.get("documents_processed") or 0)
        recommendations = int(impact_summary.get("reorder_recommendations_generated") or 0)
        if documents_processed or recommendations:
            bullets[1] = (
                f"{documents_processed} purchase document(s) and {recommendations} reorder recommendation(s) were processed in the last 30 days."
            )
        return bullets

    async def _llm_summary(self, logs: list[dict[str, Any]], days: int, *, impact: dict[str, Any] | None = None) -> list[str]:
        fallback = self._fallback_bullets(logs, days, impact=impact)
        if not logs:
            return fallback

        try:
            import anthropic

            from app.core.config import settings

            if not settings.ANTHROPIC_API_KEY:
                return fallback

            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            payload = {
                "task": "Summarize these Neumas audit logs into exactly three concise executive bullets.",
                "rules": [
                    "Focus on operational impact, risk, and recommended attention areas.",
                    "Mention concrete counts when they are obvious from the data.",
                    "Return valid JSON: {\"bullets\": [\"...\", \"...\", \"...\"]}",
                ],
                "period_days": days,
                "impact_summary": (impact or {}).get("summary") or {},
                "logs": logs[:50],
            }
            message = await client.messages.create(
                model="claude-sonnet-5",
                max_tokens=400,
                system="You are an operations intelligence analyst. Return only valid JSON.",
                messages=[{"role": "user", "content": json.dumps(payload)}],
            )
            text = "".join(
                block.text for block in message.content if getattr(block, "type", "") == "text"
            ).strip()
            parsed = json.loads(text)
            bullets = parsed.get("bullets")
            if isinstance(bullets, list):
                cleaned = [str(bullet).strip() for bullet in bullets if str(bullet).strip()]
                if cleaned:
                    return cleaned
        except Exception as exc:
            logger.warning("Executive briefing LLM summary failed", error=str(exc))

        return fallback
