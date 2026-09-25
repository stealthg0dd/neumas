from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class RowError(BaseModel):
    row_number: int
    code: str
    message: str


class ImportPreviewResponse(BaseModel):
    import_type: str
    commit: bool
    valid_rows: int
    error_rows: int
    errors: list[RowError] = []
    receipt_id: str | None = None


class UnitOfMeasure(BaseModel):
    id: UUID | None = None
    code: str
    name: str
    dimension: str = "count"
    to_base_factor: Decimal = Decimal("1")


class CanonicalIngredient(BaseModel):
    id: UUID | None = None
    organization_id: UUID | None = None
    canonical_name: str
    category: str | None = None
    base_uom_id: UUID | None = None
    density_metadata: dict[str, Any] = Field(default_factory=dict)
    external_ids: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RecipeIngredientInput(BaseModel):
    canonical_ingredient_id: UUID
    quantity: Decimal
    uom_id: UUID | None = None
    converted_base_quantity: Decimal | None = None
    substitute_group: str | None = None


class RecipeCreateRequest(BaseModel):
    name: str
    category: str | None = None
    menu_price: Decimal | None = None
    currency: str = "USD"
    yield_quantity: Decimal = Decimal("1")
    serving_count: Decimal = Decimal("1")
    portion_quantity: Decimal | None = None
    preparation_loss_pct: Decimal = Decimal("0")
    waste_allowance_pct: Decimal = Decimal("0")
    effective_from: date | None = None
    ingredients: list[RecipeIngredientInput] = []


class RecipeSummary(BaseModel):
    id: UUID
    name: str
    category: str | None = None
    menu_price: Decimal | None = None
    currency: str = "USD"
    active_version_id: UUID | None = None
    is_active: bool = True
    latest_theoretical_cost: Decimal | None = None
    cost_per_serving: Decimal | None = None
    target_food_cost_pct: Decimal | None = None
    theoretical_gross_margin: Decimal | None = None


class IngredientContribution(BaseModel):
    canonical_ingredient_id: UUID
    name: str
    quantity: Decimal
    base_quantity: Decimal
    unit_cost: Decimal | None = None
    total_cost: Decimal
    contribution_pct: Decimal | None = None
    change_vs_previous_price: Decimal | None = None


class RecipeCostResponse(BaseModel):
    recipe_id: UUID
    recipe_version_id: UUID
    latest_theoretical_cost: Decimal
    cost_per_serving: Decimal | None = None
    target_food_cost_pct: Decimal | None = None
    theoretical_gross_margin: Decimal | None = None
    ingredient_contributions: list[IngredientContribution]
    evidence: list[str] = []


class RecipeDetail(BaseModel):
    recipe: RecipeSummary
    active_cost: RecipeCostResponse | None = None
    versions: list[dict[str, Any]] = []
    ingredients: list[dict[str, Any]] = []


class FoodCostDriversResponse(BaseModel):
    generated_at: datetime
    recipes: list[RecipeSummary]
    top_ingredients: list[IngredientContribution]


class CsvImportRequest(BaseModel):
    import_type: str
    csv_text: str
    commit: bool = False
    idempotency_key: str | None = None
