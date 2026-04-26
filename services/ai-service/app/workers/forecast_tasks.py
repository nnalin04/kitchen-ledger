"""
Celery tasks for demand forecasting (heavy async operations).
Light forecasts are served synchronously from the router; this module
handles scheduled batch forecasts if needed.
"""
from __future__ import annotations

import asyncio
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="forecast_tasks.run_batch_forecast",
    bind=True,
    max_retries=2,
    acks_late=True,
)
def run_batch_forecast(self, tenant_id: str, item_ids: list[str], days: int = 7):
    """Run demand forecasting for a batch of items (for scheduled / background use)."""
    from app.services.forecast_service import forecast_item_usage

    results = []
    for item_id in item_ids:
        try:
            result = _run_async(forecast_item_usage(tenant_id, item_id, days))
            results.append(result)
        except Exception as exc:
            logger.warning("Forecast failed for item %s: %s", item_id, exc)
            results.append({"item_id": item_id, "error": str(exc)})

    logger.info("Batch forecast completed: tenant=%s items=%d", tenant_id, len(item_ids))
    return results
