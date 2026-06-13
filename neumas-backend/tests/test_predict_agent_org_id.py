from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.services import predict_agent


class _PredictionResp:
    def __init__(self, data):
        self.data = data


class _PredictionQuery:
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


class _FakePredictionSupabase:
    """Mimics predictions' NOT NULL org_id constraint."""

    def __init__(self):
        self.rows: dict[str, dict] = {}

    def table(self, name):
        return _PredictionQuery(self, name)

    def execute(self, q: _PredictionQuery):
        if q.table != "predictions":
            return _PredictionResp([])

        if q.op == "select":
            matches = [
                r
                for r in self.rows.values()
                if all(r.get(k) == v for k, v in q.filters)
            ]
            return _PredictionResp(matches)

        if q.op == "insert":
            payload = q.payload or {}
            if not payload.get("org_id"):
                raise Exception(
                    'null value in column "org_id" of relation "predictions" '
                    'violates not-null constraint'
                )
            self.rows[payload["id"]] = payload
            return _PredictionResp([payload])

        if q.op == "update":
            for row in self.rows.values():
                row.update(q.payload or {})
            return _PredictionResp([])

        return _PredictionResp([])


@pytest.mark.anyio
async def test_upsert_prediction_populates_required_org_id(monkeypatch):
    fake = _FakePredictionSupabase()
    monkeypatch.setattr(predict_agent, "get_async_supabase_admin", AsyncMock(return_value=fake))

    org_id = uuid4()
    property_id = uuid4()
    item_id = uuid4()

    await predict_agent._upsert_prediction(
        property_id=property_id,
        org_id=org_id,
        item_id=item_id,
        prediction_date=datetime.now(UTC) + timedelta(days=3),
        predicted_value=3.0,
        confidence=0.8,
        ci_low=2.4,
        ci_high=3.6,
        features={"reason": "test"},
    )

    [row] = fake.rows.values()
    assert row["org_id"] == str(org_id)
    assert row["organization_id"] == str(org_id)
