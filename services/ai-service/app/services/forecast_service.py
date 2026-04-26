"""
Demand Forecasting Service using Simple Exponential Smoothing.

Provides:
  - forecast_item_usage  — exponential smoothing on 8 weeks of history
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

logger = logging.getLogger(__name__)

from app.clients.inventory_client import get_stock_movements, get_item_cost  # noqa: E402

# Smoothing factor α
ALPHA = 0.3
# Safety stock days
SAFETY_STOCK_DAYS = 2


async def forecast_item_usage(
    tenant_id: str,
    item_id: str,
    days: int = 7,
) -> dict[str, Any]:
    """Forecast daily usage for an inventory item.

    Fetches last 8 weeks (56 days) of stock movements, aggregates daily
    consumption, applies exponential smoothing (α=0.3), and projects
    forward `days` days.

    Returns:
        {
            item_id, item_name, current_stock,
            forecast: [{date, predicted_usage}],
            suggested_order_quantity
        }
    """
    movements = await get_stock_movements(tenant_id, item_id, days=56)

    item_name = item_id
    current_stock = 0.0
    try:
        cost_data = await get_item_cost(tenant_id, item_id)
        item_name = cost_data.get("name", item_id)
        current_stock = float(cost_data.get("current_stock", 0) or 0)
    except Exception as exc:
        logger.warning("Could not fetch item metadata for %s: %s", item_id, exc)

    daily_usage = _aggregate_daily_consumption(movements)

    if not daily_usage:
        return {
            "item_id": item_id,
            "item_name": item_name,
            "current_stock": current_stock,
            "forecast": _zero_forecast(days),
            "suggested_order_quantity": 0.0,
        }

    predicted_daily = _exponential_smoothing(daily_usage, alpha=ALPHA)
    forecast_points = _build_forecast_points(predicted_daily, days)

    total_forecast = predicted_daily * days
    safety_stock = predicted_daily * SAFETY_STOCK_DAYS
    suggested_order = max(0.0, (total_forecast * 1.1) - current_stock + safety_stock)

    return {
        "item_id": item_id,
        "item_name": item_name,
        "current_stock": current_stock,
        "forecast": forecast_points,
        "suggested_order_quantity": round(suggested_order, 3),
    }


def _aggregate_daily_consumption(movements: list[dict[str, Any]]) -> list[float]:
    """Convert movement records to a list of daily consumption values."""
    from collections import defaultdict

    daily: dict[str, float] = defaultdict(float)
    for m in movements:
        movement_type = m.get("movement_type") or m.get("type") or ""
        qty = float(m.get("quantity", 0) or 0)
        movement_date = (m.get("movement_date") or m.get("created_at") or "")[:10]
        if not movement_date:
            continue
        if movement_type in ("waste", "adjustment_out", "usage", "consumption"):
            daily[movement_date] += qty

    return list(daily.values())


def _exponential_smoothing(values: list[float], alpha: float = 0.3) -> float:
    """Apply Simple Exponential Smoothing and return the next-period forecast.

    Uses a pure-Python implementation to avoid numpy/statsmodels version issues.
    Formula: S_t = α * x_t + (1 - α) * S_{t-1}
    """
    if not values:
        return 0.0
    if len(values) == 1:
        return max(0.0, float(values[0]))

    # Initialize with first value
    smoothed = float(values[0])
    for v in values[1:]:
        smoothed = alpha * float(v) + (1 - alpha) * smoothed

    return max(0.0, smoothed)


def _build_forecast_points(predicted_daily: float, days: int) -> list[dict[str, Any]]:
    today = date.today()
    return [
        {
            "date": (today + timedelta(days=i + 1)).isoformat(),
            "predicted_usage": round(predicted_daily, 4),
        }
        for i in range(days)
    ]


def _zero_forecast(days: int) -> list[dict[str, Any]]:
    today = date.today()
    return [
        {"date": (today + timedelta(days=i + 1)).isoformat(), "predicted_usage": 0.0}
        for i in range(days)
    ]
