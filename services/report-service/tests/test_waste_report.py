import os
from decimal import Decimal

# Required for settings import
os.environ.setdefault("DATABASE_URL", "postgresql://kl_user:kl_password@localhost:5432/kitchenledger_test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://localhost:8083")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://localhost:8082")
os.environ.setdefault("STAFF_SERVICE_URL", "http://localhost:8088")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")

from app.routers.reports import _aggregate_waste_metrics


def test_waste_aggregation_by_category():
    data = [
        {"category": "produce", "estimated_cost": "50", "loggedAt": "2026-04-14T10:00:00Z"},
        {"category": "produce", "estimated_cost": "25", "loggedAt": "2026-04-15T10:00:00Z"},
        {"category": "dairy", "estimated_cost": "40", "loggedAt": "2026-04-15T11:00:00Z"},
    ]

    result = _aggregate_waste_metrics(data)
    categories = {row["category"]: row["total_cost"] for row in result["category_breakdown"]}

    assert categories["produce"] == Decimal("75.00")
    assert categories["dairy"] == Decimal("40.00")


def test_waste_cost_calculation():
    data = [
        {"estimated_cost": "12.30", "loggedAt": "2026-04-14T10:00:00Z"},
        {"estimatedCost": "7.70", "loggedAt": "2026-04-14T12:00:00Z"},
    ]

    result = _aggregate_waste_metrics(data)

    assert result["total_waste_cost"] == Decimal("20.00")


def test_waste_trend_by_day_of_week():
    data = [
        {"estimated_cost": "10", "loggedAt": "2026-04-13T10:00:00Z"},  # Monday
        {"estimated_cost": "15", "loggedAt": "2026-04-13T11:00:00Z"},
        {"estimated_cost": "7", "loggedAt": "2026-04-14T11:00:00Z"},   # Tuesday
    ]

    result = _aggregate_waste_metrics(data)
    trend = {row["weekday"]: row["total_cost"] for row in result["trend_by_weekday"]}

    assert trend["Monday"] == Decimal("25.00")
    assert trend["Tuesday"] == Decimal("7.00")
