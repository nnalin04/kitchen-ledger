import os
from datetime import date
from decimal import Decimal

# Required for settings import
os.environ.setdefault("DATABASE_URL", "postgresql://kl_user:kl_password@localhost:5432/kitchenledger_test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://localhost:8083")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://localhost:8082")
os.environ.setdefault("STAFF_SERVICE_URL", "http://localhost:8088")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")

from app.routers.reports import _calc_pnl_metrics


def test_pnl_math_correct():
    dsr = [{"report_date": "2026-04-10", "gross_sales": "12000", "net_sales": "10000"}]
    expenses = [
        {"expense_date": "2026-04-10", "category": "rent", "amount": "2000"},
        {"expense_date": "2026-04-10", "category": "marketing", "amount": "1000"},
    ]

    metrics = _calc_pnl_metrics(dsr, expenses, date(2026, 4, 1), date(2026, 4, 30))

    assert metrics["gross_sales"] == Decimal("12000.00")
    assert metrics["net_sales"] == Decimal("10000.00")
    assert metrics["total_expenses"] == Decimal("3000.00")
    assert metrics["net_profit"] == Decimal("7000.00")


def test_food_cost_percentage_calculation():
    dsr = [{"report_date": "2026-04-10", "net_sales": "10000"}]
    expenses = [{"expense_date": "2026-04-10", "category": "food", "amount": "2500"}]

    metrics = _calc_pnl_metrics(dsr, expenses, date(2026, 4, 1), date(2026, 4, 30))

    assert metrics["food_cost_percentage"] == Decimal("25.00")


def test_labor_percentage_calculation():
    dsr = [{"report_date": "2026-04-10", "net_sales": "10000"}]
    expenses = [{"expense_date": "2026-04-10", "category": "labor", "amount": "3000"}]

    metrics = _calc_pnl_metrics(dsr, expenses, date(2026, 4, 1), date(2026, 4, 30))

    assert metrics["labor_cost_percentage"] == Decimal("30.00")


def test_prime_cost_calculation():
    dsr = [{"report_date": "2026-04-10", "net_sales": "10000"}]
    expenses = [
        {"expense_date": "2026-04-10", "category": "food", "amount": "2000"},
        {"expense_date": "2026-04-10", "category": "wages", "amount": "2500"},
    ]

    metrics = _calc_pnl_metrics(dsr, expenses, date(2026, 4, 1), date(2026, 4, 30))

    assert metrics["prime_cost_percentage"] == Decimal("45.00")


def test_pnl_zero_revenue_doesnt_divide_by_zero():
    dsr = [{"report_date": "2026-04-10", "net_sales": "0"}]
    expenses = [{"expense_date": "2026-04-10", "category": "food", "amount": "2000"}]

    metrics = _calc_pnl_metrics(dsr, expenses, date(2026, 4, 1), date(2026, 4, 30))

    assert metrics["food_cost_percentage"] == Decimal("0.00")
    assert metrics["labor_cost_percentage"] == Decimal("0.00")
    assert metrics["prime_cost_percentage"] == Decimal("0.00")


def test_pnl_date_range_filters_correctly():
    dsr = [
        {"report_date": "2026-04-05", "net_sales": "10000"},
        {"report_date": "2026-03-31", "net_sales": "99999"},
    ]
    expenses = [
        {"expense_date": "2026-04-06", "category": "rent", "amount": "2000"},
        {"expense_date": "2026-03-30", "category": "rent", "amount": "9999"},
    ]

    metrics = _calc_pnl_metrics(dsr, expenses, date(2026, 4, 1), date(2026, 4, 30))

    assert metrics["net_sales"] == Decimal("10000.00")
    assert metrics["total_expenses"] == Decimal("2000.00")
