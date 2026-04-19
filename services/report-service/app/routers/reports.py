"""
Report endpoints — aggregate data from finance, inventory, and staff services
via internal HTTP calls and return structured summaries.

Also exposes async job submission endpoints (POST /jobs, GET /jobs/{id}, GET /jobs)
that submit heavy report generation to Celery workers and allow polling.
"""
from __future__ import annotations
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
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
    ReportJobRequest,
    ReportJobResponse,
    ReportJobListResponse,
    VALID_REPORT_TYPES,
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

    # Fetch expenses from finance service (date-scoped server-side)
    expense_data = await get_json(
        f"{settings.finance_service_url}/internal/finance/expenses",
        params={"tenantId": tenant_id, "from": str(from_date), "to": str(to_date)},
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
        params={"tenantId": tenant_id, "from": str(from_date), "to": str(to_date)},
    )

    # Group by category (date filtering now done server-side; guard locally too)
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


# ── Async report jobs ──────────────────────────────────────────────────────

def _row_to_job_response(row: Any) -> ReportJobResponse:
    return ReportJobResponse(
        job_id=str(row.id),
        status=row.status,
        report_type=row.report_type,
        created_at=row.created_at,
        completed_at=row.completed_at,
        result_url=row.output_url,
        error_message=row.error_message,
    )


@router.post("/jobs", status_code=202, response_model=ReportJobResponse)
async def submit_report_job(
    body: ReportJobRequest,
    tenant_id: str = Header(..., alias="x-tenant-id"),
    user_id: str = Header(..., alias="x-user-id"),
    db: AsyncSession = Depends(get_db),
) -> ReportJobResponse:
    """
    Submit an async report generation job.
    Returns 202 with job_id for polling.
    Poll GET /jobs/{job_id} until status is 'completed' or 'failed'.
    """
    if body.report_type not in VALID_REPORT_TYPES:
        raise ServiceException(
            "INVALID_REPORT_TYPE",
            f"report_type must be one of: {', '.join(sorted(VALID_REPORT_TYPES))}",
        )

    job_id = str(uuid.uuid4())

    await db.execute(
        text("""
            INSERT INTO report_jobs (id, tenant_id, report_type, status, params, created_by)
            VALUES (:id, :tenant_id, :report_type, 'pending', :params::jsonb, :created_by)
        """),
        {
            "id":          job_id,
            "tenant_id":   tenant_id,
            "report_type": body.report_type,
            "params":      _json_str(body.parameters),
            "created_by":  user_id,
        },
    )
    await db.commit()

    # Submit to Celery worker (non-blocking)
    from app.workers.tasks import generate_report  # late import avoids circular deps
    generate_report.delay(job_id, body.report_type, body.parameters, tenant_id)

    row = await db.execute(
        text("SELECT * FROM report_jobs WHERE id = :id"),
        {"id": job_id},
    )
    job = row.fetchone()

    response = _row_to_job_response(job)
    response.poll_url = f"/api/v1/reports/jobs/{job_id}"
    return response


@router.get("/jobs/{job_id}", response_model=ReportJobResponse)
async def get_report_job(
    job_id: str,
    tenant_id: str = Header(..., alias="x-tenant-id"),
    db: AsyncSession = Depends(get_db),
) -> ReportJobResponse:
    """Poll job status.  When completed, result_url contains a signed download URL."""
    result = await db.execute(
        text("""
            SELECT id, status, report_type, created_at, completed_at,
                   output_url, error_message
            FROM report_jobs
            WHERE id = :id
              AND tenant_id = :tenant_id
        """),
        {"id": job_id, "tenant_id": tenant_id},
    )
    job = result.fetchone()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _row_to_job_response(job)


@router.get("/jobs", response_model=ReportJobListResponse)
async def list_report_jobs(
    tenant_id: str = Header(..., alias="x-tenant-id"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> ReportJobListResponse:
    """List recent report jobs for this tenant, newest first."""
    result = await db.execute(
        text("""
            SELECT id, status, report_type, created_at, completed_at,
                   output_url, error_message
            FROM report_jobs
            WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"tenant_id": tenant_id, "limit": limit, "offset": offset},
    )
    rows = result.fetchall()
    return ReportJobListResponse(
        jobs=[_row_to_job_response(r) for r in rows],
        limit=limit,
        offset=offset,
    )


def _json_str(data: dict) -> str:
    import json
    return json.dumps(data)
