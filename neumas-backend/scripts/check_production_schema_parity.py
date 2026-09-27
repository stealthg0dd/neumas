from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

REQUIRED_TABLES = [
    "organization_onboarding",
    "canonical_ingredients",
    "ingredient_aliases",
    "units_of_measure",
    "uom_conversions",
    "recipes",
    "recipe_versions",
    "recipe_ingredients",
    "menu_items",
    "menu_item_recipe_links",
    "sales_transactions",
    "sales_transaction_items",
    "demand_signals",
    "forecast_runs",
    "demand_forecasts",
    "demand_forecast_items",
    "forecast_evaluations",
    "supplier_items",
    "supplier_item_offers",
    "supplier_item_prices",
    "supplier_performance_metrics",
    "procurement_recommendations",
    "policies",
    "policy_rules",
    "decisions",
    "decision_evidence",
    "approvals",
    "actions",
    "action_attempts",
    "verifications",
    "outcomes",
    "purchase_orders",
    "purchase_order_items",
    "purchase_order_events",
    "supplier_acknowledgements",
    "supplier_acknowledgement_items",
    "goods_receipts",
    "goods_receipt_items",
    "invoices",
    "reconciliation_cases",
    "reconciliation_issues",
    "waste_events",
    "margin_snapshots",
    "decision_outcomes",
    "integration_connections",
    "raw_provider_events",
    "import_receipts",
    "webhook_subscriptions",
]

REQUIRED_COLUMNS = {
    "decisions": [
        "organization_id",
        "property_id",
        "trigger_type",
        "subject_type",
        "subject_id",
        "decision_type",
        "title",
        "proposed_action",
        "confidence",
        "policy_result",
        "status",
        "idempotency_key",
        "created_by_agent",
        "created_at",
    ],
    "integration_connections": [
        "credential_reference",
        "oauth_state",
        "token_expires_at",
        "webhook_subscriptions",
        "last_successful_sync_at",
        "last_error_at",
        "records_synced",
    ],
}


def request_table(base_url: str, key: str, table: str, *, select: str = "*") -> tuple[bool, str | None]:
    params = urllib.parse.urlencode({"select": select, "limit": "1"})
    req = urllib.request.Request(
        f"{base_url}/rest/v1/{table}?{params}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return 200 <= resp.status < 300, None
    except urllib.error.HTTPError as exc:
        body = exc.read(500).decode("utf-8", "ignore")
        return False, f"{exc.code}: {body}"
    except Exception as exc:
        return False, type(exc).__name__


def main() -> int:
    base_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not base_url or not key:
        print(json.dumps({"status": "blocked", "reason": "missing_supabase_env"}))
        return 2

    missing_tables: list[str] = []
    for table in REQUIRED_TABLES:
        ok, _ = request_table(base_url, key, table)
        if not ok:
            missing_tables.append(table)

    missing_columns: dict[str, list[str]] = {}
    for table, columns in REQUIRED_COLUMNS.items():
        table_missing: list[str] = []
        for column in columns:
            ok, _ = request_table(base_url, key, table, select=column)
            if not ok:
                table_missing.append(column)
        if table_missing:
            missing_columns[table] = table_missing

    result = {
        "status": "ready" if not missing_tables and not missing_columns else "missing",
        "missing_tables": missing_tables,
        "missing_columns": missing_columns,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
