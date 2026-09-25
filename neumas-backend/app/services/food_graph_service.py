from __future__ import annotations

import csv
import io
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID, uuid4

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.food_graph import (
    FoodCostDriversResponse,
    ImportPreviewResponse,
    IngredientContribution,
    RecipeCostResponse,
    RecipeCreateRequest,
    RecipeDetail,
    RecipeSummary,
    RowError,
)

logger = get_logger(__name__)


def q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class FoodGraphService:
    """Tenant-scoped Food Graph and deterministic recipe costing."""

    async def list_recipes(self, tenant: TenantContext) -> list[RecipeSummary]:
        client = await self._client()
        rows = await self._fetch_rows(
            client,
            "recipes",
            "id,name,category,menu_price,currency,active_version_id,is_active",
            tenant,
            order_by="name",
        )
        summaries: list[RecipeSummary] = []
        for row in rows:
            summary = RecipeSummary(**row)
            if summary.active_version_id:
                try:
                    cost = await self.calculate_recipe_cost(tenant, summary.id, summary.active_version_id)
                    summary.latest_theoretical_cost = cost.latest_theoretical_cost
                    summary.cost_per_serving = cost.cost_per_serving
                    summary.target_food_cost_pct = cost.target_food_cost_pct
                    summary.theoretical_gross_margin = cost.theoretical_gross_margin
                except Exception as e:
                    logger.warning("Recipe cost unavailable", recipe_id=str(summary.id), error=str(e))
            summaries.append(summary)
        return summaries

    async def get_recipe_detail(self, tenant: TenantContext, recipe_id: UUID) -> RecipeDetail | None:
        client = await self._client()
        recipe = await self._fetch_one(
            client,
            "recipes",
            "id,name,category,menu_price,currency,active_version_id,is_active",
            tenant,
            id=str(recipe_id),
        )
        if recipe is None:
            return None
        versions = await self._fetch_rows(
            client,
            "recipe_versions",
            "*",
            tenant,
            extra_eq={"recipe_id": str(recipe_id)},
            order_by="version_number",
            desc=True,
        )
        ingredients: list[dict[str, Any]] = []
        active_version_id = recipe.get("active_version_id")
        if active_version_id:
            ingredients = await self._fetch_rows(
                client,
                "recipe_ingredients",
                "*,ingredient:canonical_ingredients(id,canonical_name,category)",
                tenant,
                extra_eq={"recipe_version_id": str(active_version_id)},
                order_by="created_at",
            )
        cost = None
        if active_version_id:
            cost = await self.calculate_recipe_cost(tenant, recipe_id, UUID(str(active_version_id)))
        return RecipeDetail(recipe=RecipeSummary(**recipe), active_cost=cost, versions=versions, ingredients=ingredients)

    async def create_recipe(self, tenant: TenantContext, payload: RecipeCreateRequest) -> RecipeSummary:
        client = await self._client()
        recipe_row = {
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "name": payload.name,
            "category": payload.category,
            "menu_price": str(payload.menu_price) if payload.menu_price is not None else None,
            "currency": payload.currency,
            "is_active": True,
        }
        recipe_resp = await client.table("recipes").upsert(
            recipe_row,
            on_conflict="organization_id,property_id,name",
        ).execute()
        recipe = recipe_resp.data[0]
        version_resp = await client.table("recipe_versions").insert({
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "recipe_id": recipe["id"],
            "version_number": 1,
            "yield_quantity": str(payload.yield_quantity),
            "serving_count": str(payload.serving_count),
            "portion_quantity": str(payload.portion_quantity) if payload.portion_quantity is not None else None,
            "preparation_loss_pct": str(payload.preparation_loss_pct),
            "waste_allowance_pct": str(payload.waste_allowance_pct),
            "effective_from": payload.effective_from.isoformat() if payload.effective_from else None,
            "is_active": True,
        }).execute()
        version = version_resp.data[0]
        if payload.ingredients:
            await client.table("recipe_ingredients").insert([
                {
                    "organization_id": str(tenant.org_id),
                    "recipe_version_id": version["id"],
                    "canonical_ingredient_id": str(item.canonical_ingredient_id),
                    "quantity": str(item.quantity),
                    "uom_id": str(item.uom_id) if item.uom_id else None,
                    "converted_base_quantity": str(item.converted_base_quantity) if item.converted_base_quantity is not None else None,
                    "substitute_group": item.substitute_group,
                }
                for item in payload.ingredients
            ]).execute()
        await client.table("recipes").update({"active_version_id": version["id"]}).eq("id", recipe["id"]).eq("organization_id", str(tenant.org_id)).execute()
        recipe["active_version_id"] = version["id"]
        return RecipeSummary(**recipe)

    async def create_next_recipe_version(
        self,
        tenant: TenantContext,
        recipe_id: UUID,
        payload: RecipeCreateRequest,
    ) -> RecipeSummary:
        client = await self._client()
        versions = await self._fetch_rows(
            client,
            "recipe_versions",
            "version_number",
            tenant,
            extra_eq={"recipe_id": str(recipe_id)},
            order_by="version_number",
            desc=True,
            limit=1,
        )
        next_version = int(versions[0]["version_number"]) + 1 if versions else 1
        version_resp = await client.table("recipe_versions").insert({
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "recipe_id": str(recipe_id),
            "version_number": next_version,
            "yield_quantity": str(payload.yield_quantity),
            "serving_count": str(payload.serving_count),
            "portion_quantity": str(payload.portion_quantity) if payload.portion_quantity is not None else None,
            "preparation_loss_pct": str(payload.preparation_loss_pct),
            "waste_allowance_pct": str(payload.waste_allowance_pct),
            "effective_from": payload.effective_from.isoformat() if payload.effective_from else None,
            "is_active": True,
        }).execute()
        version = version_resp.data[0]
        await client.table("recipes").update({"active_version_id": version["id"]}).eq("id", str(recipe_id)).eq("organization_id", str(tenant.org_id)).execute()
        recipe = await self._fetch_one(client, "recipes", "id,name,category,menu_price,currency,active_version_id,is_active", tenant, id=str(recipe_id))
        if recipe is None:
            raise ValueError("Recipe not found")
        return RecipeSummary(**recipe)

    async def calculate_recipe_cost(
        self,
        tenant: TenantContext,
        recipe_id: UUID,
        recipe_version_id: UUID | None = None,
    ) -> RecipeCostResponse:
        client = await self._client()
        recipe = await self._fetch_one(client, "recipes", "id,menu_price,currency,active_version_id", tenant, id=str(recipe_id))
        if recipe is None:
            raise ValueError("Recipe not found")
        version_id = recipe_version_id or UUID(str(recipe["active_version_id"]))
        version = await self._fetch_one(client, "recipe_versions", "id,serving_count,preparation_loss_pct,waste_allowance_pct", tenant, id=str(version_id))
        if version is None:
            raise ValueError("Recipe version not found")
        ingredients = await self._fetch_rows(
            client,
            "recipe_ingredients",
            "id,canonical_ingredient_id,quantity,converted_base_quantity,ingredient:canonical_ingredients(id,canonical_name)",
            tenant,
            extra_eq={"recipe_version_id": str(version_id)},
            order_by="created_at",
        )
        contributions = await self._calculate_contributions(client, tenant, ingredients)
        loss_factor = Decimal("1") + Decimal(str(version.get("preparation_loss_pct") or 0)) / Decimal("100") + Decimal(str(version.get("waste_allowance_pct") or 0)) / Decimal("100")
        latest_cost = q2(sum((row.total_cost for row in contributions), Decimal("0")) * loss_factor)
        serving_count = Decimal(str(version.get("serving_count") or 0))
        cost_per_serving = q2(latest_cost / serving_count) if serving_count > 0 else None
        menu_price = Decimal(str(recipe["menu_price"])) if recipe.get("menu_price") is not None else None
        food_cost_pct = q2((cost_per_serving / menu_price) * Decimal("100")) if cost_per_serving is not None and menu_price and menu_price > 0 else None
        gross_margin = q2(menu_price - cost_per_serving) if cost_per_serving is not None and menu_price is not None else None
        for contribution in contributions:
            contribution.contribution_pct = q2((contribution.total_cost / latest_cost) * Decimal("100")) if latest_cost > 0 else None
        return RecipeCostResponse(
            recipe_id=recipe_id,
            recipe_version_id=version_id,
            latest_theoretical_cost=latest_cost,
            cost_per_serving=cost_per_serving,
            target_food_cost_pct=food_cost_pct,
            theoretical_gross_margin=gross_margin,
            ingredient_contributions=contributions,
            evidence=[f"{len(contributions)} ingredient costs from latest supplier prices"],
        )

    async def food_cost_drivers(self, tenant: TenantContext) -> FoodCostDriversResponse:
        recipes = await self.list_recipes(tenant)
        contributions: list[IngredientContribution] = []
        for recipe in recipes:
            if recipe.active_version_id:
                cost = await self.calculate_recipe_cost(tenant, recipe.id, recipe.active_version_id)
                contributions.extend(cost.ingredient_contributions)
        contributions.sort(key=lambda item: item.total_cost, reverse=True)
        return FoodCostDriversResponse(generated_at=datetime.now(UTC), recipes=recipes, top_ingredients=contributions[:10])

    async def import_csv(self, tenant: TenantContext, import_type: str, csv_text: str, *, commit: bool, idempotency_key: str | None = None) -> ImportPreviewResponse:
        rows = list(csv.DictReader(io.StringIO(csv_text)))
        errors: list[RowError] = []
        valid: list[dict[str, str]] = []
        required = {
            "canonical_ingredients": {"canonical_name"},
            "recipes": {"name"},
            "recipe_ingredients": {"recipe_id", "canonical_ingredient_id", "quantity"},
            "supplier_items": {"canonical_ingredient_id"},
            "supplier_prices": {"supplier_item_id", "price"},
        }.get(import_type)
        if required is None:
            raise ValueError("Unsupported import_type")
        for index, row in enumerate(rows, start=2):
            missing = [key for key in required if not row.get(key)]
            if missing:
                errors.append(RowError(row_number=index, code="missing_required", message=f"Missing: {', '.join(missing)}"))
            else:
                valid.append(row)
        receipt_id = str(uuid4()) if commit and not errors else None
        if commit and not errors and valid:
            await self._commit_import_rows(tenant, import_type, valid, idempotency_key)
        return ImportPreviewResponse(import_type=import_type, commit=commit, valid_rows=len(valid), error_rows=len(errors), errors=errors, receipt_id=receipt_id)

    async def _commit_import_rows(self, tenant: TenantContext, import_type: str, rows: list[dict[str, str]], idempotency_key: str | None) -> None:
        client = await self._client()
        org_id = str(tenant.org_id)
        property_id = str(tenant.property_id) if tenant.property_id else None
        if import_type == "canonical_ingredients":
            await client.table("canonical_ingredients").upsert([
                {
                    "organization_id": org_id,
                    "canonical_name": row["canonical_name"],
                    "category": row.get("category") or None,
                    "external_ids": {"import_key": row.get("external_id")} if row.get("external_id") else {},
                }
                for row in rows
            ], on_conflict="organization_id,canonical_name").execute()
        elif import_type == "supplier_items":
            await client.table("supplier_items").upsert([
                {
                    "organization_id": org_id,
                    "property_id": property_id,
                    "canonical_ingredient_id": row["canonical_ingredient_id"],
                    "supplier_sku": row.get("supplier_sku") or row.get("external_id") or row["canonical_ingredient_id"],
                    "supplier_name": row.get("supplier_name") or None,
                    "pack_quantity": row.get("pack_quantity") or "1",
                }
                for row in rows
            ], on_conflict="organization_id,property_id,vendor_id,supplier_sku").execute()
        elif import_type == "recipes":
            await client.table("recipes").upsert([
                {
                    "organization_id": org_id,
                    "property_id": property_id,
                    "name": row["name"],
                    "category": row.get("category") or None,
                    "menu_price": row.get("menu_price") or None,
                    "currency": row.get("currency") or "USD",
                }
                for row in rows
            ], on_conflict="organization_id,property_id,name").execute()
        elif import_type == "recipe_ingredients":
            await client.table("recipe_ingredients").upsert([
                {
                    "organization_id": org_id,
                    "recipe_version_id": row["recipe_id"],
                    "canonical_ingredient_id": row["canonical_ingredient_id"],
                    "quantity": row["quantity"],
                    "converted_base_quantity": row.get("converted_base_quantity") or row["quantity"],
                    "substitute_group": row.get("substitute_group") or None,
                }
                for row in rows
            ]).execute()
        elif import_type == "supplier_prices":
            await client.table("supplier_item_prices").upsert([
                {
                    "organization_id": org_id,
                    "property_id": property_id,
                    "supplier_item_id": row["supplier_item_id"],
                    "price": row["price"],
                    "currency": row.get("currency") or "USD",
                    "effective_at": row.get("effective_at") or datetime.now(UTC).isoformat(),
                    "idempotency_key": f"{idempotency_key}:{i}" if idempotency_key else row.get("idempotency_key"),
                }
                for i, row in enumerate(rows)
            ], on_conflict="organization_id,idempotency_key").execute()

    async def _calculate_contributions(self, client: Any, tenant: TenantContext, ingredients: list[dict[str, Any]]) -> list[IngredientContribution]:
        contributions: list[IngredientContribution] = []
        for row in ingredients:
            ingredient_id = str(row["canonical_ingredient_id"])
            supplier_items = await self._fetch_rows(
                client,
                "supplier_items",
                "id,base_quantity,pack_quantity",
                tenant,
                extra_eq={"canonical_ingredient_id": ingredient_id, "is_active": True},
                order_by="created_at",
                desc=True,
                limit=1,
            )
            unit_cost = None
            previous_delta = None
            if supplier_items:
                supplier_item = supplier_items[0]
                prices = await self._fetch_rows(
                    client,
                    "supplier_item_prices",
                    "price,effective_at",
                    tenant,
                    extra_eq={"supplier_item_id": supplier_item["id"]},
                    order_by="effective_at",
                    desc=True,
                    limit=2,
                )
                if prices:
                    denominator = Decimal(str(supplier_item.get("base_quantity") or supplier_item.get("pack_quantity") or 1))
                    unit_cost = Decimal(str(prices[0]["price"])) / denominator
                    if len(prices) > 1:
                        previous_delta = Decimal(str(prices[0]["price"])) - Decimal(str(prices[1]["price"]))
            base_qty = Decimal(str(row.get("converted_base_quantity") or row.get("quantity") or 0))
            total = q2(base_qty * (unit_cost or Decimal("0")))
            ingredient = row.get("ingredient") if isinstance(row.get("ingredient"), dict) else {}
            contributions.append(IngredientContribution(
                canonical_ingredient_id=UUID(ingredient_id),
                name=str(ingredient.get("canonical_name") or "Ingredient"),
                quantity=Decimal(str(row.get("quantity") or 0)),
                base_quantity=base_qty,
                unit_cost=q2(unit_cost) if unit_cost is not None else None,
                total_cost=total,
                change_vs_previous_price=q2(previous_delta) if previous_delta is not None else None,
            ))
        return contributions

    async def convert_quantity(self, quantity: Decimal, from_factor: Decimal, to_factor: Decimal) -> Decimal:
        if to_factor == 0:
            raise ValueError("to_factor cannot be zero")
        return quantity * from_factor / to_factor

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
        extra_eq: dict[str, Any] | None = None,
        order_by: str,
        desc: bool = False,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        query = client.table(table).select(select).eq("organization_id", str(tenant.org_id))
        if tenant.property_id and table not in {"canonical_ingredients", "units_of_measure", "uom_conversions", "ingredient_aliases", "recipe_ingredients"}:
            query = query.eq("property_id", str(tenant.property_id))
        for key, value in (extra_eq or {}).items():
            query = query.eq(key, value)
        response = await query.order(order_by, desc=desc).limit(limit).execute()
        return [row for row in (response.data or []) if isinstance(row, dict)]

    async def _fetch_one(self, client: Any, table: str, select: str, tenant: TenantContext, **filters: str) -> dict[str, Any] | None:
        rows = await self._fetch_rows(client, table, select, tenant, extra_eq=filters, order_by="created_at", limit=1)
        return rows[0] if rows else None
