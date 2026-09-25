from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import date
from decimal import Decimal
from typing import Any

from app.core.config import get_settings


class SquareAdapter:
    adapter_type = "pos"
    provider_slug = "square"
    display_name = "Square"

    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def enabled(self) -> bool:
        return all([
            self.settings.SQUARE_APPLICATION_ID,
            self.settings.SQUARE_ACCESS_TOKEN,
            self.settings.SQUARE_LOCATION_ID,
        ])

    @property
    def webhook_enabled(self) -> bool:
        return bool(self.settings.SQUARE_WEBHOOK_SIGNATURE_KEY)

    def verify_webhook_signature(self, *, notification_url: str, body: bytes, signature_header: str | None) -> bool:
        if not self.settings.SQUARE_WEBHOOK_SIGNATURE_KEY or not signature_header:
            return False
        mac = hmac.new(
            self.settings.SQUARE_WEBHOOK_SIGNATURE_KEY.encode(),
            notification_url.encode() + body,
            hashlib.sha1,
        )
        expected = base64.b64encode(mac.digest()).decode()
        return hmac.compare_digest(expected, signature_header)

    def map_order_to_sales_rows(self, order: dict[str, Any]) -> list[dict[str, str]]:
        """Map an official Square order-shaped payload into canonical sales import rows."""
        order_id = str(order.get("id") or order.get("order_id") or "")
        created_at = str(order.get("created_at") or "")
        business_date = created_at[:10] if len(created_at) >= 10 else date.today().isoformat()
        currency = str((order.get("total_money") or {}).get("currency") or "USD")
        total_amount = Decimal(str((order.get("total_money") or {}).get("amount") or 0)) / Decimal("100")
        rows: list[dict[str, str]] = []
        for index, item in enumerate(order.get("line_items") or []):
            name = str(item.get("name") or item.get("catalog_object_id") or "Square item")
            quantity = str(item.get("quantity") or "1")
            item_money = item.get("total_money") or item.get("gross_sales_money") or {}
            item_total = Decimal(str(item_money.get("amount") or 0)) / Decimal("100")
            rows.append({
                "transaction_id": f"square:{order_id}:{index}",
                "business_date": business_date,
                "service_period": self._service_period(created_at),
                "item_name": name,
                "quantity": quantity,
                "gross_sales": str(total_amount),
                "net_sales": str(total_amount),
                "item_net_sales": str(item_total),
                "currency": currency,
            })
        return rows

    def map_webhook_payload_to_orders(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        obj = data.get("object") if isinstance(data.get("object"), dict) else {}
        order = obj.get("order") if isinstance(obj.get("order"), dict) else None
        return [order] if order else []

    def _service_period(self, created_at: str) -> str | None:
        if len(created_at) < 13:
            return None
        hour = int(created_at[11:13])
        if hour < 11:
            return "breakfast"
        if hour < 16:
            return "lunch"
        return "dinner"
