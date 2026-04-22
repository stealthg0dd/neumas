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
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self._repo.list(
            tenant, state=state, alert_type=alert_type, limit=limit, offset=offset
        )

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
