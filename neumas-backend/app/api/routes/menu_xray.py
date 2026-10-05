"""
Menu X-Ray API routes.

GET /api/menu-xray/sample           — pre-built sample analysis (no scan required)
GET /api/menu-xray/{scan_id}        — retrieve stored analysis for a completed scan
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import TenantContext, get_tenant_context, require_property
from app.core.logging import get_logger
from app.schemas.menu_xray import MenuXRayAnalysisResponse

logger = get_logger(__name__)
router = APIRouter()


@router.get(
    "/sample",
    response_model=MenuXRayAnalysisResponse,
    summary="Get sample Menu X-Ray analysis",
    description="Returns a deterministic sample analysis for demonstration purposes. No file upload required.",
)
async def get_sample_analysis() -> MenuXRayAnalysisResponse:
    """Return the built-in sample analysis (no auth required for sampling)."""
    from app.services.menu_xray_service import _build_sample_analysis
    analysis = _build_sample_analysis()
    return MenuXRayAnalysisResponse(analysis=analysis, status="complete")


@router.get(
    "/{scan_id}",
    response_model=MenuXRayAnalysisResponse,
    summary="Get Menu X-Ray analysis for a scan",
)
async def get_analysis(
    scan_id: str,
    tenant: TenantContext = require_property(),
) -> MenuXRayAnalysisResponse:
    """Return the stored Menu X-Ray analysis for the given scan."""
    from app.db.supabase_client import get_async_supabase_admin
    from app.services.menu_xray_service import get_analysis_by_scan_id

    supabase = await get_async_supabase_admin()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    analysis = await get_analysis_by_scan_id(scan_id, supabase)
    if not analysis:
        # Check if scan is still processing
        try:
            scan_resp = await (
                supabase.table("scans")
                .select("status")
                .eq("id", scan_id)
                .single()
                .execute()
            )
            scan_status = (scan_resp.data or {}).get("status", "unknown")
        except Exception:
            scan_status = "unknown"

        processing_statuses = {"pending", "uploaded", "queued", "processing"}
        if scan_status in processing_statuses:
            raise HTTPException(
                status_code=status.HTTP_202_ACCEPTED,
                detail={
                    "code": "analysis_in_progress",
                    "message": "Menu X-Ray analysis is still processing.",
                    "scan_status": scan_status,
                },
            )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "analysis_not_found",
                "message": "No Menu X-Ray analysis found for this scan.",
            },
        )

    return MenuXRayAnalysisResponse(analysis=analysis, status="complete")
