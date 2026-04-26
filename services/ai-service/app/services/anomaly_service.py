"""
Anomaly Detection Service.

Detects abnormal usage spikes for inventory items and unusual expense patterns
for finance categories using rolling-average + 2σ deviation analysis.

Pure-Python statistics — no numpy/pandas dependency.
"""
from __future__ import annotations

import logging
import math
from datetime import date, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# Module-level imports for test patching
from app.clients.inventory_client import get_item_names, get_items_by_names, get_stock_movements  # noqa: E402
from app.clients.finance_client import get_expense_total  # noqa: E402

# Inventory: flag if current week > rolling 4-week avg * 1.4
INVENTORY_SPIKE_FACTOR = 1.4

# Finance: flag if current week > rolling 4-week avg + 2 * std_dev
FINANCE_SIGMA_THRESHOLD = 2.0


# ── Pure-Python stats helpers ──────────────────────────────────────────────

def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    variance = sum((v - m) ** 2 for v in values) / len(values)
    return math.sqrt(variance)


# ── Anomaly detection ──────────────────────────────────────────────────────

async def detect_inventory_anomalies(tenant_id: str) -> list[dict[str, Any]]:
    """Detect inventory items with abnormal usage in the last 7 days.

    For each item, compares last 7-day usage to 4-week rolling average.
    Flags if current_week_usage > rolling_avg * 1.4.
    """
    anomalies: list[dict[str, Any]] = []

    try:
        item_names = await get_item_names(tenant_id)
    except Exception as exc:
        logger.error("Cannot fetch item names for anomaly detection: %s", exc)
        return []

    if not item_names:
        return []

    items = await get_items_by_names(tenant_id, item_names)

    today = date.today()
    week_start = (today - timedelta(days=7)).isoformat()
    four_weeks_start = (today - timedelta(days=28)).isoformat()

    for item in items:
        item_id = str(item.get("id", ""))
        item_name = item.get("name", "unknown")
        if not item_id:
            continue
        try:
            movements = await get_stock_movements(tenant_id, item_id, days=28)
        except Exception:
            continue

        current_usage = _sum_usage_in_range(movements, week_start, today.isoformat())
        historical = _weekly_usage_buckets(movements, four_weeks_start, week_start)

        if len(historical) < 2:
            continue

        rolling_avg = _mean(historical)
        if rolling_avg == 0:
            continue

        threshold = rolling_avg * INVENTORY_SPIKE_FACTOR
        if current_usage > threshold:
            deviation_pct = ((current_usage - rolling_avg) / rolling_avg) * 100
            anomalies.append({
                "item_id": item_id,
                "item_name": item_name,
                "category": item.get("category"),
                "current_value": round(current_usage, 3),
                "rolling_average": round(rolling_avg, 3),
                "deviation_pct": round(deviation_pct, 1),
                "severity": "critical" if deviation_pct > 80 else "warning",
            })

    return anomalies


async def detect_finance_anomalies(tenant_id: str) -> list[dict[str, Any]]:
    """Detect expense categories with abnormal spending in the last 7 days.

    Flags if current_week > rolling_avg + 2 * std_dev.
    """
    anomalies: list[dict[str, Any]] = []
    today = date.today()

    categories = ["produce", "meat", "dairy", "dry_goods", "utilities", "labor", "supplies"]

    for category in categories:
        try:
            current_data = await get_expense_total(
                tenant_id,
                category=category,
                start_date=(today - timedelta(days=7)).isoformat(),
                end_date=today.isoformat(),
            )
            current_week = float(current_data.get("total", 0) or 0)

            weekly_totals: list[float] = []
            for week_offset in range(1, 5):
                week_end = today - timedelta(days=7 * week_offset)
                week_start_dt = week_end - timedelta(days=7)
                hist_data = await get_expense_total(
                    tenant_id,
                    category=category,
                    start_date=week_start_dt.isoformat(),
                    end_date=week_end.isoformat(),
                )
                weekly_totals.append(float(hist_data.get("total", 0) or 0))

            if len(weekly_totals) < 2 or all(v == 0 for v in weekly_totals):
                continue

            rolling_avg = _mean(weekly_totals)
            std_dev = _std(weekly_totals)

            threshold = rolling_avg + FINANCE_SIGMA_THRESHOLD * std_dev
            if current_week > threshold and rolling_avg > 0:
                deviation_pct = ((current_week - rolling_avg) / rolling_avg) * 100
                anomalies.append({
                    "category": category,
                    "current_value": round(current_week, 2),
                    "rolling_average": round(rolling_avg, 2),
                    "deviation_pct": round(deviation_pct, 1),
                    "severity": "critical" if deviation_pct > 50 else "warning",
                })

        except Exception as exc:
            logger.warning("Finance anomaly check failed for category %r: %s", category, exc)
            continue

    return anomalies


# ── Helpers ────────────────────────────────────────────────────────────────

def _sum_usage_in_range(
    movements: list[dict[str, Any]],
    start_date: str,
    end_date: str,
) -> float:
    total = 0.0
    for m in movements:
        movement_type = m.get("movement_type") or m.get("type") or ""
        movement_date = (m.get("movement_date") or m.get("created_at") or "")[:10]
        if not movement_date:
            continue
        if start_date <= movement_date <= end_date:
            if movement_type in ("waste", "adjustment_out", "usage", "consumption"):
                total += float(m.get("quantity", 0) or 0)
    return total


def _weekly_usage_buckets(
    movements: list[dict[str, Any]],
    start_date: str,
    end_date: str,
) -> list[float]:
    """Split movements into 7-day buckets and return list of weekly totals."""
    from datetime import datetime

    start = datetime.fromisoformat(start_date).date()
    end = datetime.fromisoformat(end_date).date()

    buckets: list[float] = []
    cursor = start
    while cursor < end:
        bucket_end = min(cursor + timedelta(days=7), end)
        total = _sum_usage_in_range(
            movements, cursor.isoformat(), bucket_end.isoformat()
        )
        buckets.append(total)
        cursor = bucket_end

    return buckets
