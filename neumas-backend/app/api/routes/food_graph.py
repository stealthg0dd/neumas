from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import TenantContext, require_property
from app.schemas.food_graph import (
    CsvImportRequest,
    FoodCostDriversResponse,
    ImportPreviewResponse,
    RecipeCostResponse,
    RecipeCreateRequest,
    RecipeDetail,
    RecipeSummary,
)
from app.services.food_graph_service import FoodGraphService

router = APIRouter()
service = FoodGraphService()


@router.get("/recipes", response_model=list[RecipeSummary])
async def list_recipes(tenant: TenantContext = require_property()) -> list[RecipeSummary]:
    return await service.list_recipes(tenant)


@router.post("/recipes", response_model=RecipeSummary, status_code=status.HTTP_201_CREATED)
async def create_recipe(payload: RecipeCreateRequest, tenant: TenantContext = require_property()) -> RecipeSummary:
    return await service.create_recipe(tenant, payload)


@router.get("/recipes/{recipe_id}", response_model=RecipeDetail)
async def get_recipe(recipe_id: UUID, tenant: TenantContext = require_property()) -> RecipeDetail:
    result = await service.get_recipe_detail(tenant, recipe_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return result


@router.post("/recipes/{recipe_id}/versions", response_model=RecipeSummary)
async def create_recipe_version(recipe_id: UUID, payload: RecipeCreateRequest, tenant: TenantContext = require_property()) -> RecipeSummary:
    return await service.create_next_recipe_version(tenant, recipe_id, payload)


@router.get("/recipes/{recipe_id}/cost", response_model=RecipeCostResponse)
async def get_recipe_cost(recipe_id: UUID, tenant: TenantContext = require_property()) -> RecipeCostResponse:
    return await service.calculate_recipe_cost(tenant, recipe_id)


@router.get("/food-cost-drivers", response_model=FoodCostDriversResponse)
async def get_food_cost_drivers(tenant: TenantContext = require_property()) -> FoodCostDriversResponse:
    return await service.food_cost_drivers(tenant)


@router.post("/imports", response_model=ImportPreviewResponse)
async def import_food_graph_csv(payload: CsvImportRequest, tenant: TenantContext = require_property()) -> ImportPreviewResponse:
    return await service.import_csv(
        tenant,
        payload.import_type,
        payload.csv_text,
        commit=payload.commit,
        idempotency_key=payload.idempotency_key,
    )
