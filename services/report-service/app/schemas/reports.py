from __future__ import annotations
from datetime import date
from decimal import Decimal
from typing import Any
from pydantic import BaseModel


# ── P&L ───────────────────────────────────────────────────────────────────

class PnlSummary(BaseModel):
    from_date: date
    to_date: date
    gross_sales: Decimal
    net_sales: Decimal
    total_expenses: Decimal
    net_profit: Decimal
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
