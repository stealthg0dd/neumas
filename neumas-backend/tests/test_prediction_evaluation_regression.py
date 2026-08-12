from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.core.constants import PredictionType
from app.tasks.evaluation_tasks import (
    _backfill_prediction_evaluations_entrypoint,
    _record_actual_value_async,
)


class _Response:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db: _FakeEvaluationSupabase, table: str):
        self.db = db
        self.table = table
        self.filters: list[tuple[str, str, object]] = []
        self.selected = "*"
        self.limit_value: int | None = None
        self.order_key: str | None = None

    def select(self, selected: str):
        self.selected = selected
        return self

    def eq(self, key: str, value: object):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key: str, values: list[object]):
        self.filters.append(("in", key, values))
        return self

    def is_(self, key: str, value: object):
        self.filters.append(("is", key, value))
        return self

    def gte(self, key: str, value: object):
        self.filters.append(("gte", key, value))
        return self

    def lte(self, key: str, value: object):
        self.filters.append(("lte", key, value))
        return self

    def order(self, key: str):
        self.order_key = key
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    async def execute(self):
        return self.db.execute(self)


class _FakeEvaluationSupabase:
    def __init__(self, predictions: list[dict], movements: list[dict] | None = None):
        self.predictions = [dict(row) for row in predictions]
        self.movements = [dict(row) for row in (movements or [])]
        self.evaluations: list[dict] = []

    def table(self, name: str):
        return _Query(self, name)

    def execute(self, query: _Query):
        if query.table == "predictions":
            rows = [row for row in self.predictions if self._matches(row, query.filters)]
            if query.order_key:
                rows.sort(key=lambda row: str(row.get(query.order_key) or ""))
            if query.limit_value is not None:
                rows = rows[: query.limit_value]
            return _Response(rows)

        if query.table == "inventory_movements":
            rows = [row for row in self.movements if self._matches(row, query.filters)]
            return _Response(rows)

        if query.table == "prediction_evaluations":
            if query.selected == "id":
                rows = [row for row in self.evaluations if self._matches(row, query.filters)]
                if query.limit_value is not None:
                    rows = rows[: query.limit_value]
                return _Response(rows)
            raise AssertionError("prediction_evaluations is written via service mock in tests")

        raise AssertionError(f"Unexpected table {query.table}")

    @staticmethod
    def _matches(row: dict, filters: list[tuple[str, str, object]]) -> bool:
        for operator, key, value in filters:
            row_value = row.get(key)
            if operator == "eq" and row_value != value:
                return False
            if operator == "in" and row_value not in value:
                return False
            if operator == "is":
                if value == "null" and row_value is not None:
                    return False
                if value != "null" and row_value is None:
                    return False
            if operator == "gte" and str(row_value) < str(value):
                return False
            if operator == "lte" and str(row_value) > str(value):
                return False
        return True


class _FakePredictionsRepo:
    def __init__(self, supabase: _FakeEvaluationSupabase):
        self.supabase = supabase
        self.record_actual_calls: list[tuple[str, float]] = []

    async def record_actual(self, _tenant, prediction_id, actual_value: float):
        prediction_id_str = str(prediction_id)
        self.record_actual_calls.append((prediction_id_str, actual_value))
        for row in self.supabase.predictions:
            if row["id"] == prediction_id_str:
                row["actual_value"] = actual_value
                row["evaluated_at"] = datetime.now(UTC).isoformat()
                return row
        raise AssertionError(f"Prediction {prediction_id_str} not found")


class _FakeOutcomeService:
    def __init__(self, supabase: _FakeEvaluationSupabase):
        self.supabase = supabase
        self.calls: list[dict] = []

    async def record_evaluation(self, tenant, prediction, **kwargs):
        if any(row["prediction_id"] == prediction["id"] for row in self.supabase.evaluations):
            return next(row for row in self.supabase.evaluations if row["prediction_id"] == prediction["id"])

        row = {
            "id": str(uuid4()),
            "prediction_id": prediction["id"],
            "property_id": str(tenant.property_id),
            "prediction_type": prediction.get("prediction_type"),
            "idempotency_key": kwargs["idempotency_key"],
        }
        self.supabase.evaluations.append(row)
        self.calls.append({"prediction": prediction, **kwargs})
        return row


def _prediction(
    *,
    property_id: str,
    item_id: str,
    prediction_type: str,
    prediction_date: datetime,
    predicted_value: float = 8.0,
) -> dict:
    return {
        "id": str(uuid4()),
        "property_id": property_id,
        "item_id": item_id,
        "inventory_item_id": item_id,
        "prediction_type": prediction_type,
        "prediction_date": prediction_date.isoformat(),
        "predicted_value": predicted_value,
        "predicted_quantity_needed": predicted_value,
        "confidence": 0.8,
        "predicted_depletion_date": prediction_date.isoformat(),
        "actual_value": None,
        "evaluated_at": None,
    }


def _movement(*, property_id: str, item_id: str, created_at: datetime, quantity_delta: float) -> dict:
    return {
        "property_id": property_id,
        "item_id": item_id,
        "movement_type": "usage",
        "quantity_delta": quantity_delta,
        "created_at": created_at.isoformat(),
    }


@pytest.mark.asyncio
async def test_record_actual_value_finds_stockout_prediction_regression():
    property_id = str(uuid4())
    item_id = str(uuid4())
    observed_at = datetime(2026, 8, 10, 12, tzinfo=UTC)
    prediction = _prediction(
        property_id=property_id,
        item_id=item_id,
        prediction_type=PredictionType.STOCKOUT,
        prediction_date=observed_at,
    )
    supabase = _FakeEvaluationSupabase(predictions=[prediction])
    repo = _FakePredictionsRepo(supabase)
    outcomes = _FakeOutcomeService(supabase)

    with (
        patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=supabase)),
        patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.prediction_outcome_service.PredictionOutcomeService", return_value=outcomes),
    ):
        result = await _record_actual_value_async(
            org_id=str(uuid4()),
            property_id=property_id,
            user_id=str(uuid4()),
            item_id=item_id,
            actual_qty=7.0,
            observed_at=observed_at.isoformat(),
        )

    assert result["status"] == "recorded"
    assert result["prediction_type"] == PredictionType.STOCKOUT
    assert repo.record_actual_calls == [(prediction["id"], 7.0)]
    assert len(outcomes.calls) == 1


@pytest.mark.asyncio
async def test_backfill_stockout_prediction_evaluates_exactly_once():
    property_id = str(uuid4())
    item_id = str(uuid4())
    pred_dt = datetime.now(UTC) - timedelta(days=3)
    prediction = _prediction(
        property_id=property_id,
        item_id=item_id,
        prediction_type=PredictionType.STOCKOUT,
        prediction_date=pred_dt,
    )
    movement = _movement(
        property_id=property_id,
        item_id=item_id,
        created_at=pred_dt + timedelta(hours=6),
        quantity_delta=-5,
    )
    supabase = _FakeEvaluationSupabase(predictions=[prediction], movements=[movement])
    repo = _FakePredictionsRepo(supabase)
    outcomes = _FakeOutcomeService(supabase)

    with (
        patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=supabase)),
        patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.prediction_outcome_service.PredictionOutcomeService", return_value=outcomes),
    ):
        first = await _backfill_prediction_evaluations_entrypoint(
            org_id=str(uuid4()),
            property_id=property_id,
            prediction_type=PredictionType.STOCKOUT,
            older_than_days=1,
            limit=100,
        )
        second = await _backfill_prediction_evaluations_entrypoint(
            org_id=str(uuid4()),
            property_id=property_id,
            prediction_type=PredictionType.STOCKOUT,
            older_than_days=1,
            limit=100,
        )

    assert first["eligible"] == 1
    assert first["evaluated"] == 1
    assert first["skipped"] == 0
    assert second["eligible"] == 0
    assert second["evaluated"] == 0
    assert len(outcomes.calls) == 1


@pytest.mark.asyncio
async def test_backfill_can_target_demand_predictions_explicitly():
    property_id = str(uuid4())
    item_id = str(uuid4())
    pred_dt = datetime.now(UTC) - timedelta(days=2)
    prediction = _prediction(
        property_id=property_id,
        item_id=item_id,
        prediction_type=PredictionType.DEMAND,
        prediction_date=pred_dt,
    )
    movement = _movement(
        property_id=property_id,
        item_id=item_id,
        created_at=pred_dt + timedelta(hours=8),
        quantity_delta=-3,
    )
    supabase = _FakeEvaluationSupabase(predictions=[prediction], movements=[movement])
    repo = _FakePredictionsRepo(supabase)
    outcomes = _FakeOutcomeService(supabase)

    with (
        patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=supabase)),
        patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.prediction_outcome_service.PredictionOutcomeService", return_value=outcomes),
    ):
        result = await _backfill_prediction_evaluations_entrypoint(
            org_id=str(uuid4()),
            property_id=property_id,
            prediction_type=PredictionType.DEMAND,
            older_than_days=1,
            limit=100,
        )

    assert result["evaluated"] == 1
    assert outcomes.calls[0]["prediction"]["prediction_type"] == PredictionType.DEMAND


@pytest.mark.asyncio
async def test_backfill_does_not_evaluate_unrelated_prediction_types():
    property_id = str(uuid4())
    item_id = str(uuid4())
    pred_dt = datetime.now(UTC) - timedelta(days=2)
    reorder_prediction = _prediction(
        property_id=property_id,
        item_id=item_id,
        prediction_type=PredictionType.REORDER,
        prediction_date=pred_dt,
    )
    movement = _movement(
        property_id=property_id,
        item_id=item_id,
        created_at=pred_dt + timedelta(hours=5),
        quantity_delta=-2,
    )
    supabase = _FakeEvaluationSupabase(predictions=[reorder_prediction], movements=[movement])
    repo = _FakePredictionsRepo(supabase)
    outcomes = _FakeOutcomeService(supabase)

    with (
        patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=supabase)),
        patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.prediction_outcome_service.PredictionOutcomeService", return_value=outcomes),
    ):
        result = await _backfill_prediction_evaluations_entrypoint(
            org_id=str(uuid4()),
            property_id=property_id,
            prediction_type=PredictionType.STOCKOUT,
            older_than_days=1,
            limit=100,
        )

    assert result["eligible"] == 0
    assert result["evaluated"] == 0
    assert outcomes.calls == []


@pytest.mark.asyncio
async def test_backfill_remains_property_scoped():
    target_property_id = str(uuid4())
    other_property_id = str(uuid4())
    item_id = str(uuid4())
    pred_dt = datetime.now(UTC) - timedelta(days=2)
    prediction = _prediction(
        property_id=other_property_id,
        item_id=item_id,
        prediction_type=PredictionType.STOCKOUT,
        prediction_date=pred_dt,
    )
    movement = _movement(
        property_id=other_property_id,
        item_id=item_id,
        created_at=pred_dt + timedelta(hours=8),
        quantity_delta=-4,
    )
    supabase = _FakeEvaluationSupabase(predictions=[prediction], movements=[movement])
    repo = _FakePredictionsRepo(supabase)
    outcomes = _FakeOutcomeService(supabase)

    with (
        patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=supabase)),
        patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.prediction_outcome_service.PredictionOutcomeService", return_value=outcomes),
    ):
        result = await _backfill_prediction_evaluations_entrypoint(
            org_id=str(uuid4()),
            property_id=target_property_id,
            prediction_type=PredictionType.STOCKOUT,
            older_than_days=1,
            limit=100,
        )

    assert result["eligible"] == 0
    assert result["evaluated"] == 0


@pytest.mark.asyncio
async def test_backfill_prevents_future_outcome_leakage():
    property_id = str(uuid4())
    item_id = str(uuid4())
    pred_dt = datetime.now(UTC) - timedelta(days=3)
    prediction = _prediction(
        property_id=property_id,
        item_id=item_id,
        prediction_type=PredictionType.STOCKOUT,
        prediction_date=pred_dt,
    )
    movement = _movement(
        property_id=property_id,
        item_id=item_id,
        created_at=pred_dt - timedelta(hours=1),
        quantity_delta=-5,
    )
    supabase = _FakeEvaluationSupabase(predictions=[prediction], movements=[movement])
    repo = _FakePredictionsRepo(supabase)
    outcomes = _FakeOutcomeService(supabase)

    with (
        patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=supabase)),
        patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.prediction_outcome_service.PredictionOutcomeService", return_value=outcomes),
    ):
        result = await _backfill_prediction_evaluations_entrypoint(
            org_id=str(uuid4()),
            property_id=property_id,
            prediction_type=PredictionType.STOCKOUT,
            older_than_days=1,
            limit=100,
        )

    assert result["eligible"] == 1
    assert result["evaluated"] == 0
    assert result["skipped"] == 1


@pytest.mark.asyncio
async def test_backfill_skips_when_outcome_evidence_is_insufficient():
    property_id = str(uuid4())
    item_id = str(uuid4())
    pred_dt = datetime.now(UTC) - timedelta(days=3)
    prediction = _prediction(
        property_id=property_id,
        item_id=item_id,
        prediction_type=PredictionType.STOCKOUT,
        prediction_date=pred_dt,
    )
    supabase = _FakeEvaluationSupabase(predictions=[prediction], movements=[])
    repo = _FakePredictionsRepo(supabase)
    outcomes = _FakeOutcomeService(supabase)

    with (
        patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=supabase)),
        patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)),
        patch("app.services.prediction_outcome_service.PredictionOutcomeService", return_value=outcomes),
    ):
        result = await _backfill_prediction_evaluations_entrypoint(
            org_id=str(uuid4()),
            property_id=property_id,
            prediction_type=PredictionType.STOCKOUT,
            older_than_days=1,
            limit=100,
        )

    assert result["eligible"] == 1
    assert result["evaluated"] == 0
    assert result["skipped"] == 1
