"""Celery tasks for post-scan operational workflow orchestration."""

from __future__ import annotations

import asyncio
from uuid import UUID

from app.api.deps import TenantContext
from app.core.celery_app import neumas_task
from app.core.logging import get_logger
from app.services.operational_workflow_service import OperationalWorkflowService

logger = get_logger(__name__)


@neumas_task(
    name="operations.run_post_scan_workflow",
    bind=True,
    queue="scans",
    max_retries=3,
    default_retry_delay=60,
)
def run_post_scan_workflow(
    self,
    *,
    scan_id: str,
    org_id: str,
    property_id: str,
    user_id: str,
    request_id: str | None = None,
) -> dict:
    """Continue a scan into the downstream operational loop."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        OperationalWorkflowService().run_post_scan_workflow(
            TenantContext(
                user_id=UUID(user_id),
                org_id=UUID(org_id),
                property_id=UUID(property_id),
                role="system",
                jwt="",
            ),
            scan_id=UUID(scan_id),
            request_id=request_id,
        )
    )
