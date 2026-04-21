"""
Shopping list routes.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import TenantContext, get_tenant_context, require_property
from app.core.logging import get_logger
from app.db.repositories.shopping_lists import get_shopping_lists_repository
from app.schemas.shopping import (
    GenerateListRequest,
    GenerateListResponse,
    MarkItemPurchasedRequest,
    ShoppingListDetailResponse,
    ShoppingListItemResponse,
    ShoppingListResponse,
    ShoppingListTotals,
)
from app.services.shopping_service import ShoppingService

logger = get_logger(__name__)
router = APIRouter()

shopping_service = ShoppingService()


def _to_list_summary(row: dict) -> ShoppingListResponse:
    return ShoppingListResponse(
        id=UUID(row["id"]),
        property_id=UUID(row["property_id"]),
        created_by_id=UUID(row["created_by_id"]),
        name=row.get("name") or "Shopping List",
        notes=row.get("notes"),
        status=row.get("status", "draft"),
        total_estimated_cost=row.get("total_estimated_cost"),
        total_actual_cost=row.get("total_actual_cost"),
        budget_limit=row.get("budget_limit"),
        approved_at=row.get("approved_at"),
        approved_by_id=UUID(row["approved_by_id"]) if row.get("approved_by_id") else None,
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _to_item_response(item: dict) -> ShoppingListItemResponse:
    return ShoppingListItemResponse(
        id=UUID(item["id"]),
        shopping_list_id=UUID(item["shopping_list_id"]),
        inventory_item_id=UUID(item["inventory_item_id"]) if item.get("inventory_item_id") else None,
        name=item.get("name") or item.get("inventory_item", {}).get("name") or "Item",
        quantity=item.get("quantity", 1),
        unit=item.get("unit") or "unit",
        priority=item.get("priority") or "normal",
        reason=item.get("reason"),
        estimated_price=item.get("estimated_price"),
        actual_price=item.get("actual_price"),
        is_purchased=bool(item.get("is_purchased", item.get("checked", False))),
        purchased_at=item.get("purchased_at"),
        created_at=item.get("created_at"),
    )


async def _get_detail_response(
    list_id: UUID,
    tenant: TenantContext,
) -> ShoppingListDetailResponse | None:
    repo = await get_shopping_lists_repository(tenant)
    row = await repo.get_by_id(tenant, list_id)
    if row is None:
        return None
    items = [_to_item_response(item) for item in row.get("items", [])]
    totals = await repo.calculate_totals(tenant, list_id)
    return ShoppingListDetailResponse(
        **_to_list_summary(row).model_dump(),
        items=items,
        totals=ShoppingListTotals(**totals),
    )


@router.get(
    "/",
    response_model=list[ShoppingListResponse],
    summary="List shopping lists (trailing slash)",
    include_in_schema=False,  # Duplicate of "" — hidden from docs
)
@router.get(
    "",
    response_model=list[ShoppingListResponse],
    summary="List shopping lists",
    description="Return shopping lists for the current property.",
)
async def list_shopping_lists(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> list[ShoppingListResponse]:
    """
    Returns the active shopping list for a property wrapped in a list so the
    frontend can treat it as a paginated collection.  Returns [] when no list
    exists rather than a 404 so the dashboard degrades gracefully.
    """
    try:
        repo = await get_shopping_lists_repository(tenant)
        rows = await repo.get_by_property(tenant, limit=50)
        return [_to_list_summary(row) for row in rows]
    except Exception as e:
        logger.error("Failed to list shopping lists", error=str(e))
        return []


@router.post(
    "/generate",
    response_model=GenerateListResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate shopping list",
    description="Enqueue async generation of a shopping list from inventory and predictions.",
)
async def generate_shopping_list(
    request: GenerateListRequest,
    tenant: TenantContext = require_property(),
) -> GenerateListResponse:
    """
    Kick off shopping list generation.

    Returns a job_id that can be used to track progress.
    The list will appear under GET / once complete.
    """
    try:
        # Resolve property_id from tenant context when not supplied in body
        if request.property_id is None:
            request.property_id = tenant.property_id
        return await shopping_service.generate_list(request, tenant)
    except Exception as e:
        err_str = str(e).lower()
        is_redis_down = "redis" in err_str or "retry limit" in err_str or "connection" in err_str
        logger.error("Failed to enqueue shopping list generation", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE if is_redis_down else status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Background worker is temporarily unavailable. Please try again in a moment." if is_redis_down else "Failed to start shopping list generation",
        )


@router.get(
    "/{list_id}",
    response_model=ShoppingListDetailResponse,
    summary="Get shopping list by ID",
    description="Fetch a specific shopping list by its ID.",
)
async def get_shopping_list(
    list_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ShoppingListDetailResponse:
    """
    Fetch a shopping list.  Falls back to getting the active list for the
    property when no list with the given ID is found (handles the case where
    the frontend passes a property_id instead of a list_id).
    """
    try:
        result = await _get_detail_response(list_id, tenant)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shopping list not found",
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch shopping list", list_id=str(list_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve shopping list",
        )


@router.patch(
    "/{list_id}/approve",
    response_model=ShoppingListResponse,
    summary="Approve shopping list",
    description="Approve a shopping list, marking it ready for ordering.",
)
async def approve_shopping_list(
    list_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ShoppingListResponse:
    """Approve a shopping list for ordering."""
    try:
        repo = await get_shopping_lists_repository(tenant)
        updated = await repo.update_status(tenant, list_id, "approved")
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shopping list not found",
            )
        return _to_list_summary(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to approve shopping list", list_id=str(list_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve shopping list",
        )


@router.patch(
    "/{list_id}/items/{item_id}/purchase",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Mark item as purchased",
    description="Mark a shopping list item as purchased with an optional actual price.",
)
async def mark_item_purchased(
    list_id: UUID,
    item_id: UUID,
    request: MarkItemPurchasedRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> None:
    """Mark a shopping list item as purchased."""
    try:
        repo = await get_shopping_lists_repository(tenant)
        await repo.mark_item_purchased(
            tenant,
            list_id,
            item_id,
            actual_price=request.actual_price,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error(
            "Failed to mark item purchased",
            list_id=str(list_id),
            item_id=str(item_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to mark item as purchased",
        )
