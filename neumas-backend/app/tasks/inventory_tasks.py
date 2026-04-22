from __future__ import annotations

import asyncio
from typing import Any

from app.core.celery_app import neumas_task
from app.core.logging import get_logger
from app.services.inventory_service import InventoryService

logger = get_logger(__name__)


@neumas_task(
    name="app.tasks.inventory_tasks.create_daily_snapshots",
    bind=True,
    queue="neumas_default",
    max_retries=2,
)
def create_daily_snapshots(self) -> dict[str, Any]:
    logger.info("Inventory snapshot task received")

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(InventoryService().create_daily_snapshots())
