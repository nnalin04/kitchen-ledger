"""
Report endpoints — aggregate data from finance, inventory, and staff services
via internal HTTP calls and return structured summaries.
"""
from __future__ import annotations
from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Header, Query

from app.core.config import settings
from app.core.http_client import get_json
from app.main import ServiceException
from app.schemas.reports import (
    PnlSummary,
    WasteReport,
    WasteItem,
    ExpenseReport,
    ExpenseCategoryBreakdown,
    StaffHoursReport,
    StaffHourEntry,
)

router = APIRouter()

TWO = Decimal("0.01")


def _dec(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value)).quantize(TWO, rounding=ROUND_HALF_UP)


def _gateway_tenant(x_tenant_id: str = Header(..., alias="x-tenant-id")) -> str:
    return x_tenant_id


# ── P&L Summary ────────────────────────────────────────────────────────────

@router.get("/pnl", response_model=PnlSummary)
async def pnl_summary(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    tenant_id: str = Header(..., alias="x-tenant-id"),
) -> PnlSummary:
    """Profit & Loss summary for a date range."""
    if to_date < from_date:
        raise ServiceException("INVALID_RANGE", "to date must be >= from date")

    # Fetch DSR summary from finance service
    dsr_data = await get_json(
        f"{settings.finance_service_url}/internal/finance/dsr",
        params={"tenantId": tenant_id, "from": str(from_date), "to": str(to_date)},
    )

    # Fetch expenses from finance service
    expense_data = await get_json(
        f"{settings.finance_service_url}/internal/finance/expenses",
        params={"tenantId": tenant_id},
    )

    # Aggregate DSR
    gross_sales = Decimal("0")
    net_sales = Decimal("0")
    for dsr in (dsr_data if isinstance(dsr_data, list) else []):
        report_date_str = dsr.get("reportDate") or dsr.get("report_date", "")
        try:
            report_date = date.fromisoformat(report_date_str)
        except (ValueError, TypeError):
            continue
        if from_date <= report_date <= to_date:
            gross_sales += _dec(dsr.get("grossSales") or dsr.get("gross_sales"))
            net_sales += _dec(dsr.get("netSales") or dsr.get("net_sales"))

    # Aggregate expenses, grouped by category
    expense_by_category: dict[str, Decimal] = defaultdict(Decimal)
    total_expenses = Decimal("0")
    for exp in (expense_data if isinstance(expense_data, list) else []):
        exp_date_str = exp.get("expenseDate") or exp.get("expense_date", "")
        try:
            exp_date = date.fromisoformat(exp_date_str)
        except (ValueError, TypeError):
            continue
        if from_date <= exp_date <= to_date:
            amount = _dec(exp.get("amount"))
            category = exp.get("category", "other")
            expense_by_category[category] += amount
            total_expenses += amount

    expense_breakdown = [
        {"category": cat, "total_amount": str(amt)}
        for cat, amt in sorted(expense_by_category.items())
    ]

    return PnlSummary(
        from_date=from_date,
        to_date=to_date,
        gross_sales=gross_sales,
        net_sales=net_sales,
        total_expenses=total_expenses,
        net_profit=(net_sales - total_expenses).quantize(TWO, rounding=ROUND_HALF_UP),
        expense_breakdown=expense_breakdown,
    )


# ── Waste Report ───────────────────────────────────────────────────────────

@router.get("/waste", response_model=WasteReport)
async def waste_report(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    tenant_id: str = Header(..., alias="x-tenant-id"),
) -> WasteReport:
    """Waste report with item-level breakdown for a date range."""
    if to_date < from_date:
        raise ServiceException("INVALID_RANGE", "to date must be >= from date")

    waste_data = await get_json(
        f"{settings.inventory_service_url}/internal/inventory/waste",
        params={
            "tenantId": tenant_id,
            "from": str(from_date),
            "to": str(to_date),
        },
    )

    items: list[WasteItem] = []
    total_cost = Decimal("0")

    for entry in (waste_data if isinstance(waste_data, list) else []):
        cost = _dec(entry.get("estimatedCost") or entry.get("estimated_cost"))
        total_cost += cost
        items.append(
            WasteItem(
                item_name=(
                    entry.get("itemName")
                    or entry.get("item_name")
                    or str(entry.get("inventoryItemId") or "")
                ),
                quantity=_dec(entry.get("quantity")),
                unit=entry.get("unit", ""),
                estimated_cost=cost,
                waste_date=entry.get("loggedAt") or entry.get("wasteDate") or entry.get("waste_date", ""),
                reason=str(entry.get("reason", "")) if entry.get("reason") else None,
            )
        )

    return WasteReport(
        from_date=from_date,
        to_date=to_date,
        total_waste_cost=total_cost.quantize(TWO, rounding=ROUND_HALF_UP),
        items=items,
    )


# ── Expense Breakdown ──────────────────────────────────────────────────────

@router.get("/expenses", response_model=ExpenseReport)
async def expense_report(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    tenant_id: str = Header(..., alias="x-tenant-id"),
) -> ExpenseReport:
    """Expense breakdown by category for a date range."""
    if to_date < from_date:
        raise ServiceException("INVALID_RANGE", "to date must be >= from date")

    expense_data = await get_json(
        f"{settings.finance_service_url}/internal/finance/expenses",
        params={"tenantId": tenant_id},
    )

    # Group by category, filter by date range
    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    total = Decimal("0")

    for exp in (expense_data if isinstance(expense_data, list) else []):
        exp_date_str = exp.get("expenseDate") or exp.get("expense_date", "")
        try:
            exp_date = date.fromisoformat(exp_date_str)
        except (ValueError, TypeError):
            continue
        if from_date <= exp_date <= to_date:
            category = exp.get("category", "other")
            by_category[category].append(exp)
            total += _dec(exp.get("amount"))

    breakdown = [
        ExpenseCategoryBreakdown(
            category=cat,
            total_amount=sum((_dec(e.get("amount")) for e in entries), Decimal("0")).quantize(
                TWO, rounding=ROUND_HALF_UP
            ),
            count=len(entries),
            items=entries,
        )
        for cat, entries in sorted(by_category.items())
    ]

    return ExpenseReport(
        from_date=from_date,
        to_date=to_date,
        total_amount=total.quantize(TWO, rounding=ROUND_HALF_UP),
        breakdown=breakdown,
    )


# ── Staff Hours ────────────────────────────────────────────────────────────

@router.get("/staff-hours", response_model=StaffHoursReport)
async def staff_hours_report(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    tenant_id: str = Header(..., alias="x-tenant-id"),
) -> StaffHoursReport:
    """Attendance hours per employee for a date range."""
    if to_date < from_date:
        raise ServiceException("INVALID_RANGE", "to date must be >= from date")

    attendance_data = await get_json(
        f"{settings.staff_service_url}/internal/staff/attendance",
        params={
            "tenantId": tenant_id,
            "from": str(from_date),
            "to": str(to_date),
        },
    )

    # Aggregate by employee
    # InternalStaffController returns {attendance: {...}, employeeName: "..."}
    hours_by_emp: dict[str, dict[str, Any]] = {}
    for rec in (attendance_data if isinstance(attendance_data, list) else []):
        att = rec.get("attendance", rec)   # handle both flat and nested shape
        emp_id = att.get("employeeId") or att.get("employee_id", "")
        if emp_id not in hours_by_emp:
            hours_by_emp[emp_id] = {
                "name": rec.get("employeeName") or rec.get("employee_name", ""),
                "hours": Decimal("0"),
                "shifts": 0,
            }
        hours_by_emp[emp_id]["hours"] += _dec(att.get("hoursWorked") or att.get("hours_worked"))
        hours_by_emp[emp_id]["shifts"] += 1

    total_hours = sum((v["hours"] for v in hours_by_emp.values()), Decimal("0"))

    entries = [
        StaffHourEntry(
            employee_id=emp_id,
            employee_name=data["name"],
            total_hours=data["hours"].quantize(TWO, rounding=ROUND_HALF_UP),
            shift_count=data["shifts"],
        )
        for emp_id, data in sorted(hours_by_emp.items(), key=lambda x: x[1]["name"])
    ]

    return StaffHoursReport(
        from_date=from_date,
        to_date=to_date,
        total_hours=total_hours.quantize(TWO, rounding=ROUND_HALF_UP),
        entries=entries,
    )
