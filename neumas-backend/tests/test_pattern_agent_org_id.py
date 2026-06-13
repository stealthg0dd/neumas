from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.services import pattern_agent


class _PatternResp:
    def __init__(self, data):
        self.data = data


class _PatternQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters: list[tuple[str, object]] = []

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    async def execute(self):
        return self.db.execute(self)


class _FakePatternSupabase:
    """Mimics consumption_patterns' NOT NULL org_id constraint."""

    def __init__(self):
        self.rows: dict[str, dict] = {}

    def table(self, name):
        return _PatternQuery(self, name)

    def execute(self, q: _PatternQuery):
        if q.table != "consumption_patterns":
            return _PatternResp([])

        if q.op == "select":
            matches = [
                r
                for r in self.rows.values()
                if all(r.get(k) == v for k, v in q.filters)
            ]
            return _PatternResp(matches)

        if q.op == "insert":
            payload = q.payload or {}
            if not payload.get("org_id"):
                raise Exception(
                    'null value in column "org_id" of relation "consumption_patterns" '
                    'violates not-null constraint'
                )
            self.rows[payload["id"]] = payload
            return _PatternResp([payload])

        if q.op == "update":
            for row in self.rows.values():
                row.update(q.payload or {})
            return _PatternResp([])

        return _PatternResp([])


@pytest.mark.anyio
async def test_upsert_pattern_populates_required_org_id(monkeypatch):
    fake = _FakePatternSupabase()
    monkeypatch.setattr(pattern_agent, "get_async_supabase_admin", AsyncMock(return_value=fake))

    org_id = str(uuid4())
    item_id = uuid4()

    await pattern_agent._upsert_pattern(
        item_id=item_id,
        pattern_type="daily",
        pattern_data={"avg_consumption_rate": 1.0},
        confidence=0.8,
        sample_size=3,
        org_id=org_id,
        property_id=str(uuid4()),
        period_start=datetime.now(UTC) - timedelta(days=5),
    )

    [row] = fake.rows.values()
    assert row["org_id"] == org_id
    assert row["organization_id"] == org_id


@pytest.mark.anyio
async def test_recompute_patterns_falls_back_to_property_org_id(monkeypatch):
    """Items with no organization_id of their own should still get a
    non-null consumption_patterns.org_id via the org_id resolved by the
    caller (scan_tasks._process_scan_async)."""
    fake = _FakePatternSupabase()
    org_id = str(uuid4())
    property_id = uuid4()
    item_id = uuid4()

    scans = [
        {
            "created_at": datetime.now(UTC).isoformat(),
            "processed_results": {
                "items": [{"item_name": "Milk", "quantity": 2}],
                "receipt_metadata": {},
            },
        }
    ]
    inventory_items = [
        {"id": str(item_id), "organization_id": None, "name": "Milk", "unit": "unit", "quantity": 1}
    ]

    monkeypatch.setattr(pattern_agent, "get_async_supabase_admin", AsyncMock(return_value=fake))
    monkeypatch.setattr(pattern_agent, "_fetch_scans", AsyncMock(return_value=scans))
    monkeypatch.setattr(pattern_agent, "_fetch_inventory_items", AsyncMock(return_value=inventory_items))

    result = await pattern_agent.recompute_patterns_for_property(property_id, org_id=org_id)

    assert result["patterns_found"] >= 1
    assert result["unmatched_receipt_items"] == 0
    for row in fake.rows.values():
        assert row["org_id"] == org_id


@pytest.mark.anyio
async def test_process_scan_passes_org_id_to_pattern_recompute(monkeypatch):
    """scan_tasks resolves org_id from the property and must forward it to
    recompute_patterns_for_property so consumption_patterns.org_id is set."""
    from tests.test_scan_pipeline import _FakeSupabase
    from app.tasks.scan_tasks import _process_scan_async

    fake = _FakeSupabase(org_id=str(uuid4()))
    scan_id = fake.scan_id

    class _Vision:
        async def analyze_receipt(self, **_kwargs):
            return {
                "items": [{"item_name": "Milk", "quantity": 2, "unit": "unit"}],
                "receipt_metadata": {"vendor_name": "Acme Foods"},
                "confidence": 0.92,
                "llm_provider": "anthropic",
                "llm_model": "claude-sonnet-4-6",
                "usage": {"input_tokens": 10, "output_tokens": 20},
            }

    recompute_patterns = AsyncMock(return_value={"items_analyzed": 1, "patterns_found": 1})

    monkeypatch.setattr("app.db.supabase_client.get_async_supabase_admin", AsyncMock(return_value=fake))
    monkeypatch.setattr("app.services.vision_agent.get_vision_agent", AsyncMock(return_value=_Vision()))
    monkeypatch.setattr("app.services.pattern_agent.recompute_patterns_for_property", recompute_patterns)
    monkeypatch.setattr("app.services.predict_agent.recompute_predictions_for_property", AsyncMock(return_value={}))

    result = await _process_scan_async(
        task=None,
        scan_id=scan_id,
        property_id=fake.property_id,
        user_id=str(uuid4()),
        image_url="https://example.test/receipt.jpg",
        scan_type="receipt",
        request_id="req-org-id",
    )

    assert result["status"] == "completed"
    recompute_patterns.assert_awaited_once()
    _, kwargs = recompute_patterns.call_args
    assert kwargs.get("org_id") == fake.org_id
