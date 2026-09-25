from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

SignalType = Literal[
    "POS_SALES",
    "RESERVATION",
    "OCCUPANCY",
    "BANQUET",
    "EVENT",
    "PROMOTION",
    "WEATHER",
    "HOLIDAY",
    "MANUAL_OVERRIDE",
]


class ImportRowError(BaseModel):
    row_number: int
    code: str
    message: str


class UniversalImportRequest(BaseModel):
    import_type: str
    csv_text: str
    commit: bool = False
    mapping: dict[str, str] = Field(default_factory=dict)
    idempotency_key: str | None = None
    source_filename: str | None = None


class UniversalImportResponse(BaseModel):
    import_type: str
    commit: bool
    total_rows: int
    valid_rows: int
    error_rows: int
    errors: list[ImportRowError] = []
    receipt_id: str | None = None
    canonical_counts: dict[str, int] = {}


class ForecastGenerateRequest(BaseModel):
    forecast_date: date
    horizon_days: int = 7
    service_period: str | None = None


class DemandForecastItemResponse(BaseModel):
    item_type: str
    item_id: UUID | None = None
    item_name: str
    current_stock: Decimal | None = None
    forecast_demand: Decimal
    projected_stock: Decimal | None = None
    required_quantity: Decimal | None = None
    recommended_order_date: date | None = None
    confidence: Decimal
    risk: str
    evidence: dict[str, Any] = {}


class ForecastRunResponse(BaseModel):
    forecast_run_id: UUID | None = None
    forecast_date: date
    horizon_days: int
    algorithm: str
    confidence: Decimal
    items: list[DemandForecastItemResponse]
    evidence: dict[str, Any] = {}


class ForecastEvaluationResponse(BaseModel):
    mae: Decimal | None = None
    mape: Decimal | None = None
    bias: Decimal | None = None
    confidence_calibration: Decimal | None = None
    sample_size: int
    evidence: dict[str, Any] = {}


class DemandDashboardResponse(BaseModel):
    generated_at: datetime
    forecast_confidence: Decimal | None = None
    items: list[DemandForecastItemResponse]
    chart: list[dict[str, Any]] = []
    critical_changes: list[DemandForecastItemResponse] = []
    evidence: list[str] = []
