from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.data_readiness import (
    DataReadinessItem,
    DataReadinessResponse,
    ReadinessStatus,
)

logger = get_logger(__name__)


@dataclass(frozen=True)
class _Signal:
    count: int
    last_updated: datetime | None = None
    unavailable: bool = False


class DataReadinessService:
    """Assess whether the tenant has enough real data for operating dashboards."""

    async def build(self, tenant: TenantContext) -> DataReadinessResponse:
        client = await get_async_supabase_admin()
        org_id = str(tenant.org_id)
        property_id = str(tenant.property_id) if tenant.property_id else None
        blockers: list[str] = []

        if property_id is None:
            blockers.append("Create a location/property before operational data can be scoped.")

        sales = await self._count(client, "sales_transactions", org_id, property_id, "transaction_date")
        inventory = await self._count(client, "inventory_items", org_id, property_id, "updated_at")
        suppliers = await self._combined_count(
            client,
            org_id,
            property_id,
            [
                ("vendors", "updated_at", False),
                ("supplier_items", "updated_at", True),
                ("supplier_item_offers", "updated_at", True),
                ("supplier_item_prices", "effective_at", True),
            ],
        )
        recipes = await self._combined_count(
            client,
            org_id,
            property_id,
            [
                ("recipes", "updated_at", True),
                ("recipe_ingredients", "updated_at", True),
                ("canonical_ingredients", "updated_at", False),
            ],
        )
        invoices = await self._combined_count(
            client,
            org_id,
            property_id,
            [
                ("invoices", "updated_at", True),
                ("documents", "created_at", True),
            ],
        )
        purchase_orders = await self._combined_count(
            client,
            org_id,
            property_id,
            [
                ("purchase_orders", "updated_at", True),
                ("shopping_lists", "updated_at", True),
            ],
        )
        demand_signals = await self._combined_count(
            client,
            org_id,
            property_id,
            [
                ("sales_transactions", "transaction_date", True),
                ("demand_signals", "signal_date", True),
            ],
        )
        forecasts = await self._combined_count(
            client,
            org_id,
            property_id,
            [
                ("demand_forecasts", "forecast_date", True),
                ("predictions", "prediction_date", True),
            ],
        )
        recommendations = await self._combined_count(
            client,
            org_id,
            property_id,
            [
                ("procurement_recommendations", "created_at", True),
                ("shopping_lists", "updated_at", True),
            ],
        )
        margin = await self._combined_count(
            client,
            org_id,
            property_id,
            [
                ("margin_snapshots", "snapshot_date", True),
                ("waste_events", "event_date", True),
                ("reconciliation_cases", "updated_at", True),
            ],
        )

        sales_item = self._item(sales, "Connect POS or upload sales.csv")
        inventory_item = self._item(inventory, "Import inventory.csv or upload invoices/receipts")
        supplier_item = self._item(suppliers, "Add suppliers and supplier pricing")
        recipe_item = self._item(recipes, "Import recipes and canonical ingredients")
        invoice_item = self._item(invoices, "Upload supplier invoices or connect accounting")
        po_item = self._item(purchase_orders, "Create purchase orders or approve reorder plans")
        demand_item = self._item(demand_signals, "Import sales history, reservations, events, or manual demand signals")
        forecast_item = self._dependent_item(
            forecasts,
            ready_dependencies=[sales_item],
            partial_dependencies=[demand_item],
            missing_action="Generate forecasts after sales or demand history is available",
        )
        procurement_item = self._dependent_item(
            recommendations,
            ready_dependencies=[inventory_item, supplier_item, forecast_item],
            partial_dependencies=[inventory_item, supplier_item, demand_item],
            missing_action="Add inventory, supplier pricing, and demand forecasts",
        )
        margin_item = self._dependent_item(
            margin,
            ready_dependencies=[recipe_item, supplier_item, invoice_item],
            partial_dependencies=[recipe_item, invoice_item],
            missing_action="Add recipes, supplier costs, invoices, and waste records",
        )

        for label, item in [
            ("sales_data", sales_item),
            ("inventory_data", inventory_item),
            ("supplier_data", supplier_item),
            ("recipe_data", recipe_item),
            ("invoice_data", invoice_item),
            ("purchase_order_data", po_item),
            ("demand_history", demand_item),
            ("forecast_ready", forecast_item),
            ("procurement_ready", procurement_item),
            ("margin_ready", margin_item),
        ]:
            if item.status == "MISSING":
                blockers.append(f"{label}: {item.required_action}")

        return DataReadinessResponse(
            organization_id=org_id,
            property_id=property_id,
            sales_data=sales_item,
            inventory_data=inventory_item,
            supplier_data=supplier_item,
            recipe_data=recipe_item,
            invoice_data=invoice_item,
            purchase_order_data=po_item,
            demand_history=demand_item,
            forecast_ready=forecast_item,
            procurement_ready=procurement_item,
            margin_ready=margin_item,
            blockers=blockers,
        )

    async def _count(
        self,
        client: Any,
        table: str,
        org_id: str,
        property_id: str | None,
        updated_column: str,
        *,
        property_scoped: bool = True,
    ) -> _Signal:
        try:
            query = client.table(table).select(updated_column, count="exact").eq("organization_id", org_id)
            if property_scoped and property_id:
                query = query.eq("property_id", property_id)
            response = await query.order(updated_column, desc=True).limit(1).execute()
            count = int(getattr(response, "count", None) or len(response.data or []))
            last_updated = self._parse_datetime((response.data or [{}])[0].get(updated_column)) if response.data else None
            return _Signal(count=count, last_updated=last_updated)
        except Exception as exc:
            logger.warning("Readiness source unavailable", table=table, error=str(exc))
            return _Signal(count=0, unavailable=True)

    async def _combined_count(
        self,
        client: Any,
        org_id: str,
        property_id: str | None,
        sources: list[tuple[str, str, bool]],
    ) -> _Signal:
        total = 0
        latest: datetime | None = None
        unavailable = False
        for table, updated_column, property_scoped in sources:
            signal = await self._count(
                client,
                table,
                org_id,
                property_id,
                updated_column,
                property_scoped=property_scoped,
            )
            total += signal.count
            unavailable = unavailable or signal.unavailable
            if signal.last_updated and (latest is None or signal.last_updated > latest):
                latest = signal.last_updated
        return _Signal(count=total, last_updated=latest, unavailable=unavailable)

    def _item(self, signal: _Signal, missing_action: str) -> DataReadinessItem:
        status: ReadinessStatus
        if signal.count > 0 and not signal.unavailable:
            status = "READY"
        elif signal.count > 0:
            status = "PARTIAL"
        else:
            status = "MISSING"
        return DataReadinessItem(
            status=status,
            record_count=signal.count,
            last_updated=signal.last_updated,
            required_action="No action required" if status == "READY" else missing_action,
        )

    def _dependent_item(
        self,
        signal: _Signal,
        *,
        ready_dependencies: list[DataReadinessItem],
        partial_dependencies: list[DataReadinessItem],
        missing_action: str,
    ) -> DataReadinessItem:
        if signal.count > 0 and all(item.status == "READY" for item in ready_dependencies):
            status: ReadinessStatus = "READY"
        elif signal.count > 0 or any(item.status in {"READY", "PARTIAL"} for item in partial_dependencies):
            status = "PARTIAL"
        else:
            status = "MISSING"
        return DataReadinessItem(
            status=status,
            record_count=signal.count,
            last_updated=signal.last_updated,
            required_action="No action required" if status == "READY" else missing_action,
        )

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if not isinstance(value, str) or not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
