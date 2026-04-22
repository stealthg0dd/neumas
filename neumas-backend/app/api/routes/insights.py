"""
Public insights / research blog API — backed by Supabase `research_posts`.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import TenantContext, get_tenant_context
from app.core.config import settings
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.services.executive_briefing_service import ExecutiveBriefingService

logger = get_logger(__name__)

router = APIRouter()
briefing_service = ExecutiveBriefingService()


@router.get("/executive-briefing")
async def executive_briefing(
    tenant: TenantContext = Depends(get_tenant_context),
) -> dict[str, Any]:
    return await briefing_service.get_briefing(tenant, days=7)


@router.get("/posts")
async def list_posts(
    category: str | None = None,
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    supabase = await get_async_supabase_admin()
    if not supabase:
        raise HTTPException(503, "Insights unavailable — database not configured")

    q = (
        supabase.table("research_posts")
        .select("id,slug,title,summary,category,tags,created_at,view_count", count="exact")
        .eq("published", True)
    )
    if category:
        q = q.eq("category", category)

    res = await q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    return {
        "posts": res.data or [],
        "total": res.count if res.count is not None else len(res.data or []),
    }


@router.get("/posts/{slug}")
async def get_post(slug: str) -> dict[str, Any]:
    supabase = await get_async_supabase_admin()
    if not supabase:
        raise HTTPException(503, "Insights unavailable — database not configured")

    res = await (
        supabase.table("research_posts")
        .select("*")
        .eq("slug", slug)
        .eq("published", True)
        .limit(1)
        .execute()
    )

    rows = res.data or []
    if not rows:
        raise HTTPException(404, "Post not found")
    row = rows[0]

    current = int(row.get("view_count") or 0)
    await (
        supabase.table("research_posts")
        .update({"view_count": current + 1})
        .eq("slug", slug)
        .execute()
    )

    row["view_count"] = current + 1
    return row


@router.post("/generate", include_in_schema=False)
async def trigger_post_generation(admin_key: str | None = Query(None)) -> dict[str, Any]:
    """Internal: generate a new research post. Requires admin key."""
    expected = os.environ.get("ADMIN_SECRET_KEY") or settings.ADMIN_SECRET_KEY
    if not admin_key or admin_key != expected:
        raise HTTPException(403, "Invalid key")

    from app.services.research_agent import generate_research_post

    post_data = await generate_research_post()
    supabase = await get_async_supabase_admin()
    if not supabase:
        raise HTTPException(503, "Database not configured")

    payload = {**post_data, "published": True}
    await supabase.table("research_posts").upsert(payload, on_conflict="slug").execute()
    return {"status": "created", "slug": post_data["slug"]}
