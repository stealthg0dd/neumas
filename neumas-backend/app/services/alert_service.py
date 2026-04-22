from __future__ import annotations

"""
Alert service — manages alert lifecycle and reorder trigger evaluation.

Reorder triggers fire when:
- quantity <= par_level (low_stock)
- quantity == 0 (out_of_stock)
- last scan > NO_RECENT_SCAN_DAYS days ago

Each check is idempotent — no duplicate open alerts are created for the
same item+type combination.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.alerts import AlertsRepository
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class AlertService:
    """Service for alert management and reorder evaluation."""

    NO_RECENT_SCAN_DAYS = 7

    def __init__(self) -> None:
        self._repo = AlertsRepository()

    async def evaluate_inventory(self, tenant: TenantContext) -> list[dict[str, Any]]:
        """
        Evaluate all inventory items for this property and create alerts.

        Returns list of newly created alerts.
        """
        client = await get_async_supabase_admin()
        prop_filter = str(tenant.property_id) if tenant.property_id else None
        if not prop_filter:
            logger.warning("evaluate_inventory called without property_id")
            return []

        items_resp = await (
            client.table("inventory_items")
            .select(
                "id, name, quantity, par_level, unit, updated_at, average_daily_usage, safety_buffer"
            )
            .eq("property_id", prop_filter)
            .execute()
        )
        items = items_resp.data or []
        existing_open = await self._repo.list(
            tenant,
            state="open",
            limit=max(200, len(items) * 4 or 50),
        )
        existing_pairs = {
            (str(alert.get("item_id")), str(alert.get("alert_type")))
            for alert in existing_open
            if alert.get("item_id") and alert.get("alert_type")
        }
        has_no_recent_scan = any(
            alert.get("alert_type") == "no_recent_scan"
            for alert in existing_open
        )

        created: list[dict[str, Any]] = []

        for item in items:
            item_id = UUID(item["id"])
            qty = float(item["quantity"] or 0)
            par = float(item.get("par_level") or 0)
            item_key = str(item_id)

            if qty == 0 and (item_key, "out_of_stock") not in existing_pairs:
                alert = await self._repo.create(
                    tenant,
                    alert_type="out_of_stock",
                    severity="critical",
                    title=f"{item['name']} is out of stock",
                    body=f"Current quantity is 0 {item.get('unit', 'units')}.",
                    item_id=item_id,
                    metadata={"quantity": qty, "par_level": par},
                )
                if alert:
                    created.append(alert)
                    existing_pairs.add((item_key, "out_of_stock"))

            elif par > 0 and qty <= par and (item_key, "low_stock") not in existing_pairs:
                alert = await self._repo.create(
                    tenant,
                    alert_type="low_stock",
                    severity="high" if qty <= par * 0.5 else "medium",
                    title=f"{item['name']} is below par level",
                    body=f"Current quantity {qty} {item.get('unit', 'units')} is at or below par {par}.",
                    item_id=item_id,
                    metadata={"quantity": qty, "par_level": par},
                )
                if alert:
                    created.append(alert)
                    existing_pairs.add((item_key, "low_stock"))

            avg_daily_usage = float(item.get("average_daily_usage") or 0)
            safety_buffer_days = float(item.get("safety_buffer") or 0)

            # Predictive restock trigger: fire when projected stockout is within the
            # configured safety buffer window.
            if (
                avg_daily_usage > 0
                and qty > 0
                and (item_key, "predicted_stockout") not in existing_pairs
            ):
                days_until_stockout = qty / avg_daily_usage
                if days_until_stockout <= max(1.0, safety_buffer_days):
                    predicted_date = (
                        datetime.now(UTC) + timedelta(days=max(days_until_stockout, 0))
                    ).date()
                    severity = (
                        "critical"
                        if days_until_stockout <= 1
                        else "high"
                        if days_until_stockout <= 3
                        else "medium"
                    )
                    alert = await self._repo.create(
                        tenant,
                        alert_type="predicted_stockout",
                        severity=severity,
                        title=f"{item['name']} predicted to stock out soon",
                        body=(
                            f"Projected depletion in {max(0, int(round(days_until_stockout)))} day(s) "
                            f"around {predicted_date.isoformat()}."
                        ),
                        item_id=item_id,
                        metadata={
                            "quantity": qty,
                            "average_daily_usage": avg_daily_usage,
                            "safety_buffer_days": safety_buffer_days,
                            "days_until_stockout": round(days_until_stockout, 2),
                            "predicted_stockout_date": predicted_date.isoformat(),
                        },
                    )
                    if alert:
                        created.append(alert)
                        existing_pairs.add((item_key, "predicted_stockout"))

        try:
            latest_scan_resp = await (
                client.table("scans")
                .select("created_at")
                .eq("property_id", prop_filter)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            latest_scan = (latest_scan_resp.data or [None])[0]
            if latest_scan and latest_scan.get("created_at"):
                last_scan_at = datetime.fromisoformat(
                    str(latest_scan["created_at"]).replace("Z", "+00:00")
                )
                days_since_scan = max(0, (datetime.now(UTC) - last_scan_at).days)
                if days_since_scan >= self.NO_RECENT_SCAN_DAYS and not has_no_recent_scan:
                    alert = await self._repo.create(
                        tenant,
                        alert_type="no_recent_scan",
                        severity="medium" if days_since_scan < 14 else "high",
                        title="No recent scan activity detected",
                        body=f"No scans have landed in {days_since_scan} day(s). Baselines may be stale.",
                        metadata={
                            "last_scan_at": latest_scan["created_at"],
                            "days_since_scan": days_since_scan,
                        },
                    )
                    if alert:
                        created.append(alert)
        except Exception:
            logger.debug("Latest scan lookup unavailable during alert evaluation")

        if created:
            logger.info(
                "Alerts created from inventory evaluation",
                count=len(created),
                property_id=prop_filter,
            )
        return created

    async def list_alerts(
        self,
        tenant: TenantContext,
        state: str | None = None,
        alert_type: str | None = None,
        severity: str | None = None,
        sort_by: str = "created_at_desc",
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        alerts = await self._repo.list(
            tenant,
            state=state,
            alert_type=alert_type,
            severity=severity,
            limit=limit,
            offset=offset,
        )
        return await self._enrich_alerts(tenant, alerts, sort_by=sort_by)

    async def get_alert(
        self, tenant: TenantContext, alert_id: UUID
    ) -> dict[str, Any] | None:
        return await self._repo.get_by_id(tenant, alert_id)

    async def snooze(
        self,
        tenant: TenantContext,
        alert_id: UUID,
        snooze_until: str,
    ) -> dict[str, Any] | None:
        return await self._repo.transition_state(
            tenant, alert_id, "snoozed", snooze_until=snooze_until
        )

    async def resolve(
        self,
        tenant: TenantContext,
        alert_id: UUID,
    ) -> dict[str, Any] | None:
        return await self._repo.transition_state(
            tenant, alert_id, "resolved", resolved_by_id=tenant.user_id
        )

    async def count_open(self, tenant: TenantContext) -> int:
        return await self._repo.count_open(tenant)

    async def _enrich_alerts(
        self,
        tenant: TenantContext,
        alerts: list[dict[str, Any]],
        sort_by: str,
    ) -> list[dict[str, Any]]:
        client = await get_async_supabase_admin()
        item_ids = [str(alert["item_id"]) for alert in alerts if alert.get("item_id")]
        item_names: dict[str, str] = {}
        if item_ids:
            item_resp = await (
                client.table("inventory_items")
                .select("id,name")
                .in_("id", item_ids)
                .execute()
            )
            item_names = {
                str(row["id"]): row.get("name") or "Item"
                for row in (item_resp.data or [])
            }

        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        enriched: list[dict[str, Any]] = []
        for alert in alerts:
            metadata = alert.get("metadata") or {}
            enriched.append(
                {
                    **alert,
                    "item_name": item_names.get(str(alert.get("item_id"))) if alert.get("item_id") else None,
                    "recommended_action": self._recommended_action(alert.get("alert_type")),
                    "baseline_context": self._baseline_context(alert.get("alert_type"), metadata),
                    "last_scan_at": metadata.get("last_scan_at"),
                }
            )

        if sort_by == "severity":
            enriched.sort(
                key=lambda alert: (
                    severity_order.get(str(alert.get("severity")), 99),
                    str(alert.get("created_at") or ""),
                )
            )
        else:
            enriched.sort(key=lambda alert: str(alert.get("created_at") or ""), reverse=True)

        return enriched

    def _recommended_action(self, alert_type: Any) -> str:
        return {
            "out_of_stock": "Restock immediately and review the latest shopping list.",
            "low_stock": "Top up this item before the next scan cycle.",
            "predicted_stockout": "Add this item to the next reorder batch based on projected runout.",
            "no_recent_scan": "Run a fresh receipt scan to refresh inventory and forecasts.",
        }.get(str(alert_type), "Review this alert and decide whether intervention is needed.")

    def _baseline_context(self, alert_type: Any, metadata: dict[str, Any]) -> str | None:
        if str(alert_type) == "no_recent_scan":
            days = metadata.get("days_since_scan")
            return f"Last scan was {days} day(s) ago." if days is not None else None
        if metadata.get("par_level") is not None and metadata.get("quantity") is not None:
            return f"On hand {metadata['quantity']} against baseline {metadata['par_level']}."
        if metadata.get("days_until_stockout") is not None:
            return f"Projected stockout in {metadata['days_until_stockout']} day(s)."
        return None
