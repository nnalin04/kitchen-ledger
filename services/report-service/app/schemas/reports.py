from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from pydantic import BaseModel, Field


# ── P&L ───────────────────────────────────────────────────────────────────

class PnlSummary(BaseModel):
    from_date: date
    to_date: date
    gross_sales: Decimal
    net_sales: Decimal
    total_expenses: Decimal
    net_profit: Decimal
    food_cost_percentage: Decimal
    labor_cost_percentage: Decimal
    prime_cost_percentage: Decimal
    expense_breakdown: list[dict[str, Any]]


# ── Waste ──────────────────────────────────────────────────────────────────

class WasteItem(BaseModel):
    item_name: str
    quantity: Decimal
    unit: str
    estimated_cost: Decimal
    waste_date: str
    reason: str | None


class WasteReport(BaseModel):
    from_date: date
    to_date: date
    total_waste_cost: Decimal
    category_breakdown: list[dict[str, Any]]
    trend_by_weekday: list[dict[str, Any]]
    items: list[WasteItem]


# ── Expenses ───────────────────────────────────────────────────────────────

class ExpenseCategoryBreakdown(BaseModel):
    category: str
    total_amount: Decimal
    count: int
    items: list[dict[str, Any]]


class ExpenseReport(BaseModel):
    from_date: date
    to_date: date
    total_amount: Decimal
    breakdown: list[ExpenseCategoryBreakdown]


# ── Staff Hours ────────────────────────────────────────────────────────────

class StaffHourEntry(BaseModel):
    employee_id: str
    employee_name: str
    total_hours: Decimal
    shift_count: int


class StaffHoursReport(BaseModel):
    from_date: date
    to_date: date
    total_hours: Decimal
    entries: list[StaffHourEntry]


# ── Async report job ───────────────────────────────────────────────────────

VALID_REPORT_TYPES = {
    "pnl",
    "waste",
    "expenses",
    "staff-hours",
    "inventory-variance",
    "food-cost-by-category",
    "labor-cost",
    "menu-engineering",
    "vendor-spend",
    "splh",
    "employee-performance",
    "audit-log",
}


class ReportJobRequest(BaseModel):
    report_type: str = Field(
        ...,
        description=(
            "One of: pnl, waste, expenses, staff-hours, inventory-variance, "
            "food-cost-by-category, labor-cost, menu-engineering, vendor-spend, "
            "splh, employee-performance, audit-log"
        ),
    )
    parameters: dict[str, str] = Field(
        default_factory=dict,
        description="Report parameters (e.g. {from: '2024-01-01', to: '2024-01-31'})",
    )


class ReportJobResponse(BaseModel):
    job_id: str
    status: str
    report_type: str
    created_at: datetime
    completed_at: datetime | None = None
    result_url: str | None = None
    error_message: str | None = None
    poll_url: str | None = None


class ReportJobListResponse(BaseModel):
    jobs: list[ReportJobResponse]
    limit: int
    offset: int
