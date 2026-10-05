"""
Pydantic schemas for Menu X-Ray analysis results.

All cost/margin figures are estimates unless real supplier data is linked.
"""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class IngredientEstimate(BaseModel):
    ingredient: str
    quantity: float
    unit: str
    estimated_cost_low: float
    estimated_cost_high: float
    estimated_cost: float  # midpoint


class DishAnalysis(BaseModel):
    dish_name: str
    menu_price: float
    currency: str
    category: str
    description: str | None = None
    inferred_ingredients: list[IngredientEstimate] = Field(default_factory=list)
    estimated_ingredient_cost: float    # low bound
    estimated_ingredient_cost_max: float  # high bound
    estimated_food_cost_pct: float
    confidence: float = Field(ge=0.0, le=1.0)
    margin_signal: Literal["Healthy", "Watch", "Margin Risk"]


class IngredientExposure(BaseModel):
    ingredient: str
    appears_in_dishes: int
    estimated_total_cost_contribution: float  # per-menu-cycle
    exposure_pct: float  # share of total ingredient spend


class CategoryEconomic(BaseModel):
    category: str
    dish_count: int
    average_food_cost_pct: float
    margin_signal: Literal["Healthy", "Watch", "Margin Risk"]


class MarginOpportunity(BaseModel):
    dish_name: str
    current_food_cost_pct: float
    opportunity_description: str
    estimated_saving_per_dish: float
    opportunity_type: Literal["Procurement", "Pricing", "Waste", "Recipe"] | None = None
    effort: Literal["Low", "Medium", "High"] | None = None
    confidence: float | None = None


class MenuXRayInsights(BaseModel):
    menu_health_score: int = Field(ge=0, le=100)
    average_food_cost_pct: float
    margin_risk_count: int
    watch_count: int
    healthy_count: int
    largest_ingredient_exposures: list[IngredientExposure] = Field(default_factory=list)
    category_economics: list[CategoryEconomic] = Field(default_factory=list)
    top_margin_opportunities: list[MarginOpportunity] = Field(default_factory=list)
    recommended_action: str
    estimated_monthly_opportunity: float | None = None
    currency: str


class MenuXRayAnalysis(BaseModel):
    analysis_id: str
    scan_id: str | None = None
    user_id: str | None = None
    org_id: str | None = None
    menu_name: str
    currency: str
    dishes_detected: int
    analysis_confidence: float
    created_at: datetime
    dishes: list[DishAnalysis] = Field(default_factory=list)
    insights: MenuXRayInsights
    is_sample: bool = False
    estimates_disclaimer: str = (
        "All ingredient costs and food cost percentages are AI estimates based on "
        "typical market prices. Connect real supplier data for precise figures."
    )


class MenuXRayAnalysisResponse(BaseModel):
    """API response wrapper."""
    analysis: MenuXRayAnalysis
    status: str = "complete"
    message: str | None = None
