from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import uuid4

from app.api.deps import TenantContext
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.demand import (
    DemandDashboardResponse,
    DemandForecastItemResponse,
    ForecastEvaluationResponse,
    ForecastGenerateRequest,
    ForecastRunResponse,
    ImportRowError,
    UniversalImportResponse,
)


def d2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class DemandService:
    """Universal imports and explainable deterministic demand forecasting."""

    REQUIRED_COLUMNS = {
        "sales": {"business_date", "item_name", "quantity"},
        "sales.csv": {"business_date", "item_name", "quantity"},
        "inventory": {"name", "quantity"},
        "inventory.csv": {"name", "quantity"},
        "recipes": {"name"},
        "recipes.csv": {"name"},
        "suppliers": {"supplier_name"},
        "suppliers.csv": {"supplier_name"},
        "supplier_prices": {"supplier_item_id", "price"},
        "supplier_prices.csv": {"supplier_item_id", "price"},
        "purchase_orders": {"external_id"},
        "purchase_orders.csv": {"external_id"},
        "deliveries": {"external_id"},
        "deliveries.csv": {"external_id"},
        "invoices": {"external_id"},
        "invoices.csv": {"external_id"},
        "waste": {"item_name", "quantity"},
        "waste.csv": {"item_name", "quantity"},
        "reservations": {"signal_date", "quantity"},
        "reservations.csv": {"signal_date", "quantity"},
        "events": {"signal_date", "event_name"},
        "events.csv": {"signal_date", "event_name"},
    }

    async def import_csv(
        self,
        tenant: TenantContext,
        import_type: str,
        csv_text: str,
        *,
        commit: bool,
        mapping: dict[str, str] | None = None,
        idempotency_key: str | None = None,
        source_filename: str | None = None,
    ) -> UniversalImportResponse:
        normalized_type = import_type.lower()
        required = self.REQUIRED_COLUMNS.get(normalized_type)
        if required is None:
            raise ValueError("Unsupported import_type")
        rows = [self._map_row(row, mapping or {}) for row in csv.DictReader(io.StringIO(csv_text))]
        errors: list[ImportRowError] = []
        valid: list[dict[str, str]] = []
        for index, row in enumerate(rows, start=2):
            missing = [key for key in required if not row.get(key)]
            if missing:
                errors.append(ImportRowError(row_number=index, code="missing_required", message=f"Missing: {', '.join(sorted(missing))}"))
            elif normalized_type in {"purchase_orders", "purchase_orders.csv"} and not (row.get("vendor_id") or self._supplier_name(row)):
                errors.append(ImportRowError(row_number=index, code="missing_required", message="Missing: supplier_name or vendor_id"))
            else:
                valid.append(row)

        receipt_id = None
        counts: dict[str, int] = {}
        if commit and not errors:
            receipt_id = str(uuid4())
            counts = await self._commit_rows(tenant, normalized_type, valid, idempotency_key)
            await self._record_import(tenant, normalized_type, source_filename, idempotency_key, mapping or {}, rows, errors, counts)

        return UniversalImportResponse(
            import_type=import_type,
            commit=commit,
            total_rows=len(rows),
            valid_rows=len(valid),
            error_rows=len(errors),
            errors=errors,
            receipt_id=receipt_id,
            canonical_counts=counts,
            import_id=receipt_id,
            accepted_rows=len(valid),
            rejected_rows=len(errors),
            warnings=[],
            row_errors=errors,
        )

    async def generate_forecast(self, tenant: TenantContext, request: ForecastGenerateRequest, *, persist: bool = True) -> ForecastRunResponse:
        client = await self._client()
        since = request.forecast_date - timedelta(days=56)
        sales = await self._fetch_rows(
            client,
            "sales_transaction_items",
            "item_name,quantity,created_at,sales_transaction:sales_transactions(business_date,service_period)",
            tenant,
            order_by="created_at",
            extra_gte={"created_at": since.isoformat()},
            limit=2000,
        )
        signals = await self._fetch_rows(
            client,
            "demand_signals",
            "signal_type,signal_date,service_period,quantity,value,confidence,metadata",
            tenant,
            order_by="signal_date",
            extra_gte={"signal_date": request.forecast_date.isoformat()},
            limit=500,
        )
        inventory = await self._fetch_rows(
            client,
            "inventory_items",
            "id,name,quantity",
            tenant,
            order_by="updated_at",
            limit=1000,
        )
        items = self._forecast_items(sales, signals, inventory, request)
        confidence = self._overall_confidence(items)
        run_id = uuid4() if persist else None
        if persist:
            await self._persist_forecast(client, tenant, run_id, request, confidence, items)
        return ForecastRunResponse(
            forecast_run_id=run_id,
            forecast_date=request.forecast_date,
            horizon_days=request.horizon_days,
            algorithm="moving_average_dow_weighted_v1",
            confidence=confidence,
            items=items,
            evidence={"sales_rows": len(sales), "signals": len(signals), "inventory_rows": len(inventory)},
        )

    async def dashboard(self, tenant: TenantContext) -> DemandDashboardResponse:
        today = date.today()
        forecast = await self.generate_forecast(tenant, ForecastGenerateRequest(forecast_date=today, horizon_days=7), persist=False)
        chart = [
            {"date": (today + timedelta(days=i)).isoformat(), "demand": float(sum((item.forecast_demand for item in forecast.items), Decimal("0")) / Decimal("7"))}
            for i in range(7)
        ]
        critical = [item for item in forecast.items if item.risk in {"critical", "high"}]
        return DemandDashboardResponse(
            generated_at=datetime.now(UTC),
            forecast_confidence=forecast.confidence,
            items=forecast.items,
            chart=chart,
            critical_changes=critical,
            evidence=[f"{len(forecast.items)} forecast rows", str(forecast.evidence)],
        )

    async def evaluate_forecast(self, forecast_items: list[Decimal], actuals: list[Decimal], confidences: list[Decimal] | None = None) -> ForecastEvaluationResponse:
        if not forecast_items or not actuals:
            return ForecastEvaluationResponse(sample_size=0, evidence={"reason": "no comparable rows"})
        pairs = list(zip(forecast_items, actuals, strict=False))
        errors = [actual - forecast for forecast, actual in pairs]
        abs_errors = [abs(error) for error in errors]
        mae = d2(sum(abs_errors, Decimal("0")) / Decimal(len(abs_errors)))
        mape_values = [abs(actual - forecast) / actual * Decimal("100") for forecast, actual in pairs if actual != 0]
        mape = d2(sum(mape_values, Decimal("0")) / Decimal(len(mape_values))) if mape_values else None
        bias = d2(sum(errors, Decimal("0")) / Decimal(len(errors)))
        calibration = None
        if confidences:
            avg_conf = sum(confidences, Decimal("0")) / Decimal(len(confidences))
            accuracy_proxy = max(Decimal("0"), Decimal("1") - (mae / (sum(actuals, Decimal("0")) / Decimal(len(actuals)) or Decimal("1"))))
            calibration = d2(abs(avg_conf - accuracy_proxy))
        return ForecastEvaluationResponse(mae=mae, mape=mape, bias=bias, confidence_calibration=calibration, sample_size=len(pairs), evidence={"metric": "forecast_vs_actual"})

    def explode_recipe_demand(self, menu_quantity: Decimal, links: list[dict[str, Any]], ingredients_by_version: dict[str, list[dict[str, Any]]]) -> dict[str, Decimal]:
        totals: dict[str, Decimal] = defaultdict(Decimal)
        for link in links:
            multiplier = Decimal(str(link.get("quantity_multiplier") or 1))
            version_id = str(link["recipe_version_id"])
            for ingredient in ingredients_by_version.get(version_id, []):
                ingredient_id = str(ingredient["canonical_ingredient_id"])
                qty = Decimal(str(ingredient.get("converted_base_quantity") or ingredient.get("quantity") or 0))
                totals[ingredient_id] += menu_quantity * multiplier * qty
        return dict(totals)

    def _forecast_items(
        self,
        sales: list[dict[str, Any]],
        signals: list[dict[str, Any]],
        inventory: list[dict[str, Any]],
        request: ForecastGenerateRequest,
    ) -> list[DemandForecastItemResponse]:
        by_item: dict[str, list[tuple[date, Decimal]]] = defaultdict(list)
        for row in sales:
            tx = row.get("sales_transaction")
            if isinstance(tx, list):
                tx = tx[0] if tx else {}
            if not isinstance(tx, dict):
                tx = {}
            business_date = date.fromisoformat(str(tx.get("business_date") or request.forecast_date))
            if request.service_period and tx.get("service_period") != request.service_period:
                continue
            by_item[str(row.get("item_name") or "Item")].append((business_date, Decimal(str(row.get("quantity") or 0))))
        inventory_by_name = {str(row.get("name") or ""): Decimal(str(row.get("quantity") or 0)) for row in inventory}
        items: list[DemandForecastItemResponse] = []
        uplift = self._signal_uplift(signals)
        for name, observations in by_item.items():
            forecast = self._weighted_forecast(observations, request.forecast_date, request.horizon_days) * uplift
            current = inventory_by_name.get(name)
            projected = current - forecast if current is not None else None
            required = abs(projected) if projected is not None and projected < 0 else Decimal("0")
            confidence = self._confidence(observations, signals)
            risk = "critical" if required > 0 else "high" if projected is not None and projected <= forecast * Decimal("0.25") else "normal"
            items.append(DemandForecastItemResponse(
                item_type="menu_item",
                item_name=name,
                current_stock=d2(current) if current is not None else None,
                forecast_demand=d2(forecast),
                projected_stock=d2(projected) if projected is not None else None,
                required_quantity=d2(required),
                recommended_order_date=request.forecast_date if required > 0 else None,
                confidence=confidence,
                risk=risk,
                evidence={"history_rows": len(observations), "uplift": str(uplift)},
            ))
        return sorted(items, key=lambda item: (item.risk != "critical", item.item_name))

    def _weighted_forecast(self, observations: list[tuple[date, Decimal]], target_date: date, horizon_days: int) -> Decimal:
        if not observations:
            return Decimal("0")
        recent_cutoff = target_date - timedelta(days=14)
        recent = [qty for day, qty in observations if day >= recent_cutoff]
        recent_avg = sum(recent or [qty for _, qty in observations], Decimal("0")) / Decimal(len(recent or observations))
        same_dow = [qty for day, qty in observations if day.weekday() == target_date.weekday()]
        dow_avg = sum(same_dow, Decimal("0")) / Decimal(len(same_dow)) if same_dow else recent_avg
        sorted_obs = sorted(observations, key=lambda item: item[0])
        trend = Decimal("0")
        if len(sorted_obs) >= 2:
            trend = (sorted_obs[-1][1] - sorted_obs[0][1]) / Decimal(max((sorted_obs[-1][0] - sorted_obs[0][0]).days, 1))
        daily = (recent_avg * Decimal("0.55")) + (dow_avg * Decimal("0.35")) + (max(trend, Decimal("-999")) * Decimal("0.10"))
        return max(Decimal("0"), daily * Decimal(horizon_days))

    def _signal_uplift(self, signals: list[dict[str, Any]]) -> Decimal:
        uplift = Decimal("1")
        for signal in signals:
            if signal.get("signal_type") in {"EVENT", "PROMOTION", "BANQUET", "HOLIDAY"}:
                value = Decimal(str(signal.get("value") or signal.get("quantity") or 0))
                if value > 0:
                    uplift += min(value / Decimal("100"), Decimal("0.50"))
        return uplift

    def _confidence(self, observations: list[tuple[date, Decimal]], signals: list[dict[str, Any]]) -> Decimal:
        depth = min(Decimal(len(observations)) / Decimal("28"), Decimal("1"))
        freshness = Decimal("1") if observations and max(day for day, _ in observations) >= date.today() - timedelta(days=14) else Decimal("0.5")
        quantities = [qty for _, qty in observations]
        avg = sum(quantities, Decimal("0")) / Decimal(len(quantities)) if quantities else Decimal("0")
        variance_penalty = Decimal("0.2") if avg and max(quantities) - min(quantities) > avg * Decimal("2") else Decimal("0")
        signal_quality = min(sum(Decimal(str(s.get("confidence") or "0.5")) for s in signals) / Decimal(max(len(signals), 1)), Decimal("1"))
        return d2(max(Decimal("0.1"), min(Decimal("0.95"), depth * Decimal("0.45") + freshness * Decimal("0.25") + signal_quality * Decimal("0.30") - variance_penalty)))

    def _overall_confidence(self, items: list[DemandForecastItemResponse]) -> Decimal:
        if not items:
            return Decimal("0")
        return d2(sum((item.confidence for item in items), Decimal("0")) / Decimal(len(items)))

    def _map_row(self, row: dict[str, str], mapping: dict[str, str]) -> dict[str, str]:
        if not mapping:
            return row
        mapped = dict(row)
        for source, target in mapping.items():
            if source in row:
                mapped[target] = row[source]
        return mapped

    async def _commit_rows(self, tenant: TenantContext, import_type: str, rows: list[dict[str, str]], idempotency_key: str | None) -> dict[str, int]:
        client = await self._client()
        org_id = str(tenant.org_id)
        property_id = str(tenant.property_id) if tenant.property_id else None
        if import_type in {"sales", "sales.csv"}:
            tx_payload = [
                {
                    "organization_id": org_id,
                    "property_id": property_id,
                    "external_id": row.get("transaction_id") or f"{idempotency_key}:{i}",
                    "business_date": row["business_date"],
                    "service_period": row.get("service_period"),
                    "gross_sales": row.get("gross_sales") or row.get("net_sales") or 0,
                    "net_sales": row.get("net_sales") or row.get("gross_sales") or 0,
                    "currency": row.get("currency") or "USD",
                    "source": "csv",
                }
                for i, row in enumerate(rows)
            ]
            tx_resp = await client.table("sales_transactions").upsert(tx_payload, on_conflict="organization_id,property_id,external_id").execute()
            tx_rows = tx_resp.data or []
            item_payload = [
                {
                    "organization_id": org_id,
                    "property_id": property_id,
                    "sales_transaction_id": tx_rows[i]["id"],
                    "item_name": row["item_name"],
                    "quantity": row["quantity"],
                    "net_sales": row.get("item_net_sales") or row.get("net_sales") or 0,
                }
                for i, row in enumerate(rows)
                if i < len(tx_rows)
            ]
            if item_payload:
                await client.table("sales_transaction_items").insert(item_payload).execute()
            return {"sales_transactions": len(tx_rows), "sales_transaction_items": len(item_payload)}
        if import_type in {"reservations", "reservations.csv", "events", "events.csv"}:
            signal_type = "RESERVATION" if "reservation" in import_type else "EVENT"
            await client.table("demand_signals").upsert([
                {
                    "organization_id": org_id,
                    "property_id": property_id,
                    "signal_type": signal_type,
                    "signal_date": row["signal_date"],
                    "service_period": row.get("service_period"),
                    "quantity": row.get("quantity"),
                    "value": row.get("value"),
                    "confidence": row.get("confidence") or "0.7",
                    "source": "csv",
                    "idempotency_key": row.get("external_id") or f"{idempotency_key}:{i}",
                    "metadata": {"event_name": row.get("event_name")},
                }
                for i, row in enumerate(rows)
            ], on_conflict="organization_id,property_id,signal_type,signal_date,service_period,idempotency_key").execute()
            return {"demand_signals": len(rows)}
        if import_type in {"inventory", "inventory.csv"}:
            inventory_count = 0
            movement_count = 0
            for i, row in enumerate(rows):
                item = await self._upsert_inventory_item(client, tenant, row)
                if item is None:
                    continue
                inventory_count += 1
                await client.table("inventory_movements").upsert({
                    "organization_id": org_id,
                    "property_id": property_id,
                    "item_id": item["id"],
                    "movement_type": "count",
                    "quantity_delta": str(Decimal(str(row["quantity"])) - Decimal(str(item.get("previous_quantity") or 0))),
                    "quantity_before": str(item.get("previous_quantity") or 0),
                    "quantity_after": row["quantity"],
                    "unit": row.get("unit") or item.get("unit") or "unit",
                    "reference_type": "import",
                    "created_by_id": str(tenant.user_id),
                    "notes": "Initial setup inventory import",
                    "idempotency_key": row.get("external_id") or f"{idempotency_key or 'inventory-import'}:{org_id}:{property_id}:{row['name'].strip().lower()}:{i}",
                }, on_conflict="idempotency_key").execute()
                movement_count += 1
            return {"inventory_items": inventory_count, "inventory_movements": movement_count}
        if import_type in {"suppliers", "suppliers.csv"}:
            for i, row in enumerate(rows):
                await self._resolve_vendor_id(client, tenant, row, i, idempotency_key)
            return {"vendors": len(rows)}
        if import_type in {"invoices", "invoices.csv"}:
            invoices = []
            for i, row in enumerate(rows):
                vendor_id = await self._resolve_vendor_id(client, tenant, row, i, idempotency_key)
                subtotal = row.get("subtotal") or row.get("amount") or row.get("total") or "0"
                delivery_fee = row.get("delivery_fee") or "0"
                tax = row.get("tax") or "0"
                total = row.get("total") or str(Decimal(str(subtotal)) + Decimal(str(delivery_fee)) + Decimal(str(tax)))
                invoices.append({
                    "organization_id": org_id,
                    "property_id": property_id,
                    "vendor_id": vendor_id,
                    "purchase_order_id": row.get("purchase_order_id") or None,
                    "goods_receipt_id": row.get("goods_receipt_id") or None,
                    "invoice_number": row.get("invoice_number") or row["external_id"],
                    "invoice_date": row.get("invoice_date") or row.get("business_date") or date.today().isoformat(),
                    "currency": row.get("currency") or "USD",
                    "subtotal": subtotal,
                    "delivery_fee": delivery_fee,
                    "tax": tax,
                    "total": total,
                    "status": row.get("status") or "open",
                })
            if invoices:
                await client.table("supplier_invoices").upsert(invoices, on_conflict="organization_id,vendor_id,invoice_number").execute()
            return {"supplier_invoices": len(invoices)}
        if import_type in {"purchase_orders", "purchase_orders.csv"}:
            purchase_orders = []
            purchase_order_count = 0
            for i, row in enumerate(rows):
                vendor_id = await self._resolve_vendor_id(client, tenant, row, i, idempotency_key)
                if vendor_id is None:
                    continue
                subtotal = row.get("subtotal") or row.get("total") or "0"
                delivery_fee = row.get("delivery_fee") or "0"
                tax = row.get("tax") or "0"
                total = row.get("total") or str(Decimal(str(subtotal)) + Decimal(str(delivery_fee)) + Decimal(str(tax)))
                purchase_orders.append({
                    "organization_id": org_id,
                    "property_id": property_id,
                    "vendor_id": vendor_id,
                    "state": row.get("state") or "DRAFT",
                    "currency": row.get("currency") or "USD",
                    "expected_delivery_date": row.get("expected_delivery_date") or None,
                    "external_reference": row["external_id"],
                    "subtotal": subtotal,
                    "delivery_fee": delivery_fee,
                    "tax": tax,
                    "total": total,
                    "pricing_snapshot": {"source": "csv"},
                    "commercial_snapshot": {"source": "csv", "idempotency_key": idempotency_key},
                })
                existing_resp = await (
                    client.table("purchase_orders")
                    .select("id")
                    .eq("organization_id", org_id)
                    .eq("property_id", property_id)
                    .eq("external_reference", row["external_id"])
                    .limit(1)
                    .execute()
                )
                existing = (existing_resp.data or [None])[0]
                if existing:
                    await (
                        client.table("purchase_orders")
                        .update(purchase_orders.pop())
                        .eq("id", existing["id"])
                        .eq("organization_id", org_id)
                        .execute()
                    )
                purchase_order_count += 1
            if purchase_orders:
                await client.table("purchase_orders").insert(purchase_orders).execute()
            return {"purchase_orders": purchase_order_count}
        if import_type in {"deliveries", "deliveries.csv"}:
            receipts = []
            receipt_count = 0
            for i, row in enumerate(rows):
                notes = row.get("notes") or f"Imported delivery {row['external_id']}"
                receipt = {
                    "organization_id": org_id,
                    "property_id": property_id,
                    "vendor_id": await self._resolve_vendor_id(client, tenant, row, i, idempotency_key),
                    "purchase_order_id": row.get("purchase_order_id") or None,
                    "receipt_date": row.get("receipt_date") or row.get("delivery_date") or date.today().isoformat(),
                    "status": row.get("status") or "RECEIVED",
                    "received_by_id": str(tenant.user_id),
                    "notes": notes,
                }
                existing_resp = await (
                    client.table("goods_receipts")
                    .select("id")
                    .eq("organization_id", org_id)
                    .eq("property_id", property_id)
                    .eq("notes", notes)
                    .limit(1)
                    .execute()
                )
                existing = (existing_resp.data or [None])[0]
                if existing:
                    await (
                        client.table("goods_receipts")
                        .update(receipt)
                        .eq("id", existing["id"])
                        .eq("organization_id", org_id)
                        .execute()
                    )
                else:
                    receipts.append(receipt)
                receipt_count += 1
            if receipts:
                await client.table("goods_receipts").insert(receipts).execute()
            return {"goods_receipts": receipt_count}
        if import_type in {"waste", "waste.csv"}:
            waste_events = []
            waste_count = 0
            for row in rows:
                event = {
                    "organization_id": org_id,
                    "property_id": property_id,
                    "waste_type": row.get("waste_type") or row.get("type") or "unknown",
                    "inventory_item_id": row.get("inventory_item_id") or None,
                    "canonical_ingredient_id": row.get("canonical_ingredient_id") or None,
                    "quantity": row["quantity"],
                    "uom": row.get("unit") or row.get("uom") or "unit",
                    "cost": row.get("cost") or None,
                    "reason": row.get("reason") or row.get("item_name"),
                    "source": "csv",
                    "event_date": row.get("event_date") or row.get("business_date") or date.today().isoformat(),
                    "created_by_id": str(tenant.user_id),
                }
                existing_resp = await (
                    client.table("waste_events")
                    .select("id")
                    .eq("organization_id", org_id)
                    .eq("property_id", property_id)
                    .eq("event_date", event["event_date"])
                    .eq("reason", event["reason"])
                    .eq("quantity", event["quantity"])
                    .limit(1)
                    .execute()
                )
                existing = (existing_resp.data or [None])[0]
                if existing:
                    await (
                        client.table("waste_events")
                        .update(event)
                        .eq("id", existing["id"])
                        .eq("organization_id", org_id)
                        .execute()
                    )
                else:
                    waste_events.append(event)
                waste_count += 1
            if waste_events:
                await client.table("waste_events").insert(waste_events).execute()
            return {"waste_events": waste_count}
        return {"validated_rows": len(rows)}

    async def _upsert_inventory_item(self, client: Any, tenant: TenantContext, row: dict[str, str]) -> dict[str, Any] | None:
        org_id = str(tenant.org_id)
        property_id = str(tenant.property_id) if tenant.property_id else None
        if property_id is None:
            return None
        existing_resp = await (
            client.table("inventory_items")
            .select("id,quantity,unit")
            .eq("organization_id", org_id)
            .eq("property_id", property_id)
            .eq("name", row["name"])
            .limit(1)
            .execute()
        )
        existing = (existing_resp.data or [None])[0]
        payload = {
            "organization_id": org_id,
            "property_id": property_id,
            "name": row["name"],
            "quantity": row["quantity"],
            "unit": row.get("unit") or row.get("uom") or (existing or {}).get("unit") or "unit",
            "sku": row.get("sku") or None,
            "barcode": row.get("barcode") or None,
            "min_quantity": row.get("min_quantity") or "0",
            "max_quantity": row.get("max_quantity") or None,
            "reorder_point": row.get("reorder_point") or None,
            "cost_per_unit": row.get("cost_per_unit") or None,
            "currency": row.get("currency") or "USD",
            "supplier_info": {"supplier_name": self._supplier_name(row)} if self._supplier_name(row) else {},
            "metadata": {"source": "csv"},
        }
        if existing:
            await (
                client.table("inventory_items")
                .update(payload)
                .eq("id", existing["id"])
                .eq("organization_id", org_id)
                .execute()
            )
            return {**payload, "id": existing["id"], "previous_quantity": existing.get("quantity") or 0}
        inserted = await client.table("inventory_items").insert(payload).execute()
        item = (inserted.data or [payload])[0]
        return {**item, "previous_quantity": 0}

    async def _resolve_vendor_id(
        self,
        client: Any,
        tenant: TenantContext,
        row: dict[str, str],
        index: int,
        idempotency_key: str | None,
    ) -> str | None:
        if row.get("vendor_id"):
            return row["vendor_id"]
        supplier_name = self._supplier_name(row)
        if not supplier_name:
            return None
        vendor_resp = await client.table("vendors").upsert({
            "organization_id": str(tenant.org_id),
            "name": supplier_name,
            "normalized_name": self._normalize_name(supplier_name),
            "contact_email": row.get("contact_email") or row.get("email") or None,
            "contact_phone": row.get("contact_phone") or row.get("phone") or None,
            "address": row.get("address") or None,
            "website": row.get("website") or None,
            "metadata": {
                "source": "csv",
                "external_id": row.get("supplier_external_id") or row.get("external_id"),
                "idempotency_key": f"{idempotency_key}:{index}" if idempotency_key else None,
            },
        }, on_conflict="organization_id,normalized_name").execute()
        data = vendor_resp.data or []
        return str(data[0]["id"]) if data and data[0].get("id") else None

    def _supplier_name(self, row: dict[str, str]) -> str | None:
        value = row.get("supplier_name") or row.get("vendor_name")
        return value.strip() if isinstance(value, str) and value.strip() else None

    def _normalize_name(self, value: str) -> str:
        return " ".join(value.strip().lower().split())

    async def _record_import(self, tenant: TenantContext, import_type: str, source_filename: str | None, idempotency_key: str | None, mapping: dict[str, str], rows: list[dict[str, str]], errors: list[ImportRowError], counts: dict[str, int]) -> None:
        client = await self._client()
        raw_resp = await client.table("raw_imports").upsert({
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "import_type": import_type,
            "source_filename": source_filename,
            "idempotency_key": idempotency_key,
            "mapping": mapping,
            "status": "committed",
            "total_rows": len(rows),
            "valid_rows": len(rows) - len(errors),
            "error_rows": len(errors),
            "row_errors": [error.model_dump() for error in errors],
            "created_by_id": str(tenant.user_id),
        }, on_conflict="organization_id,property_id,import_type,idempotency_key").execute()
        raw_id = (raw_resp.data or [{}])[0].get("id")
        await client.table("import_receipts").upsert({
            "raw_import_id": raw_id,
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "import_type": import_type,
            "canonical_counts": counts,
            "row_errors": [error.model_dump() for error in errors],
            "idempotency_key": idempotency_key,
        }, on_conflict="organization_id,property_id,import_type,idempotency_key").execute()

    async def _persist_forecast(self, client: Any, tenant: TenantContext, run_id: Any, request: ForecastGenerateRequest, confidence: Decimal, items: list[DemandForecastItemResponse]) -> None:
        run_resp = await client.table("forecast_runs").insert({
            "id": str(run_id),
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "forecast_date": request.forecast_date.isoformat(),
            "horizon_days": request.horizon_days,
            "algorithm": "moving_average_dow_weighted_v1",
            "evidence": {"confidence": str(confidence)},
            "created_by_id": str(tenant.user_id),
        }).execute()
        run_id_str = (run_resp.data or [{"id": str(run_id)}])[0]["id"]
        for item in items:
            forecast_resp = await client.table("demand_forecasts").insert({
                "organization_id": str(tenant.org_id),
                "property_id": str(tenant.property_id) if tenant.property_id else None,
                "forecast_run_id": run_id_str,
                "forecast_date": request.forecast_date.isoformat(),
                "service_period": request.service_period,
                "forecast_quantity": str(item.forecast_demand),
                "confidence": str(item.confidence),
                "evidence": item.evidence,
            }).execute()
            forecast_id = (forecast_resp.data or [{"id": str(uuid4())}])[0]["id"]
            await client.table("demand_forecast_items").insert({
                    "organization_id": str(tenant.org_id),
                    "property_id": str(tenant.property_id) if tenant.property_id else None,
                    "demand_forecast_id": forecast_id,
                    "item_type": item.item_type,
                    "item_id": str(item.item_id) if item.item_id else None,
                    "item_name": item.item_name,
                    "current_stock": str(item.current_stock) if item.current_stock is not None else None,
                    "forecast_demand": str(item.forecast_demand),
                    "projected_stock": str(item.projected_stock) if item.projected_stock is not None else None,
                    "required_quantity": str(item.required_quantity) if item.required_quantity is not None else None,
                    "recommended_order_date": item.recommended_order_date.isoformat() if item.recommended_order_date else None,
                    "confidence": str(item.confidence),
                    "risk": item.risk,
                    "evidence": {**item.evidence, "forecast_run_id": run_id_str},
                }
            ).execute()

    async def _client(self) -> Any:
        client = await get_async_supabase_admin()
        if client is None:
            raise RuntimeError("Supabase client unavailable")
        return client

    async def _fetch_rows(
        self,
        client: Any,
        table: str,
        select: str,
        tenant: TenantContext,
        *,
        order_by: str,
        limit: int,
        extra_gte: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        query = client.table(table).select(select).eq("organization_id", str(tenant.org_id))
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        for key, value in (extra_gte or {}).items():
            if hasattr(query, "gte"):
                query = query.gte(key, value)
        response = await query.order(order_by, desc=True).limit(limit).execute()
        return [row for row in (response.data or []) if isinstance(row, dict)]
