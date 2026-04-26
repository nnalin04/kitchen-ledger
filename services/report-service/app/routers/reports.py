"""
Report endpoints — aggregate data from finance, inventory, and staff services
via internal HTTP calls and return structured summaries.

Also exposes async job submission endpoints (POST /jobs, GET /jobs/{id}, GET /jobs)
that submit heavy report generation to Celery workers and allow polling.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.http_client import get_json
from app.core.exceptions import ServiceException
from app.schemas.reports import (
    ExpenseCategoryBreakdown,
    ExpenseReport,
    PnlSummary,
    ReportJobListResponse,
    ReportJobRequest,
    ReportJobResponse,
    StaffHourEntry,
    StaffHoursReport,
    VALID_REPORT_TYPES,
    WasteItem,
    WasteReport,
)

router = APIRouter()

TWO = Decimal("0.01")


def _dec(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value)).quantize(TWO, rounding=ROUND_HALF_UP)


def _safe_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _safe_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text_val = str(value)
    try:
        return datetime.fromisoformat(text_val.replace("Z", "+00:00"))
    except ValueError:
        return None


def _pct(numerator: Decimal, denominator: Decimal) -> Decimal:
    if denominator <= 0:
        return Decimal("0.00")
    return ((numerator / denominator) * Decimal("100")).quantize(TWO, rounding=ROUND_HALF_UP)


def _calc_pnl_metrics(
    dsr_data: list[dict[str, Any]],
    expense_data: list[dict[str, Any]],
    from_date: date,
    to_date: date,
) -> dict[str, Any]:
    gross_sales = Decimal("0")
    net_sales = Decimal("0")

    for dsr in dsr_data:
        report_date = _safe_date(dsr.get("reportDate") or dsr.get("report_date"))
        if report_date and from_date <= report_date <= to_date:
            gross_sales += _dec(dsr.get("grossSales") or dsr.get("gross_sales"))
            net_sales += _dec(dsr.get("netSales") or dsr.get("net_sales"))

    total_expenses = Decimal("0")
    cogs = Decimal("0")
    labor = Decimal("0")
    expense_by_category: dict[str, Decimal] = defaultdict(Decimal)

    for exp in expense_data:
        exp_date = _safe_date(exp.get("expenseDate") or exp.get("expense_date"))
        if not exp_date or not (from_date <= exp_date <= to_date):
            continue

        amount = _dec(exp.get("amount"))
        category = str(exp.get("category") or "other").strip().lower()
        expense_by_category[category] += amount
        total_expenses += amount

        if category in {"food", "cogs", "inventory", "ingredients", "raw_material"}:
            cogs += amount
        if category in {"labor", "payroll", "wages", "salary", "staff"}:
            labor += amount

    return {
        "gross_sales": gross_sales.quantize(TWO, rounding=ROUND_HALF_UP),
        "net_sales": net_sales.quantize(TWO, rounding=ROUND_HALF_UP),
        "total_expenses": total_expenses.quantize(TWO, rounding=ROUND_HALF_UP),
        "net_profit": (net_sales - total_expenses).quantize(TWO, rounding=ROUND_HALF_UP),
        "food_cost_percentage": _pct(cogs, net_sales),
        "labor_cost_percentage": _pct(labor, net_sales),
        "prime_cost_percentage": _pct(cogs + labor, net_sales),
        "expense_by_category": expense_by_category,
    }


def _aggregate_waste_metrics(waste_data: list[dict[str, Any]]) -> dict[str, Any]:
    total_cost = Decimal("0")
    by_category: dict[str, Decimal] = defaultdict(Decimal)
    by_weekday: dict[str, Decimal] = defaultdict(Decimal)

    for entry in waste_data:
        cost = _dec(entry.get("estimatedCost") or entry.get("estimated_cost"))
        total_cost += cost

        category = str(entry.get("category") or entry.get("reason") or "uncategorized")
        by_category[category] += cost

        waste_dt = _safe_datetime(entry.get("loggedAt") or entry.get("wasteDate") or entry.get("waste_date"))
        if waste_dt:
            by_weekday[waste_dt.strftime("%A")] += cost

    return {
        "total_waste_cost": total_cost.quantize(TWO, rounding=ROUND_HALF_UP),
        "category_breakdown": [
            {"category": cat, "total_cost": amt.quantize(TWO, rounding=ROUND_HALF_UP)}
            for cat, amt in sorted(by_category.items())
        ],
        "trend_by_weekday": [
            {"weekday": day, "total_cost": amt.quantize(TWO, rounding=ROUND_HALF_UP)}
            for day, amt in sorted(by_weekday.items())
        ],
    }


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

    dsr_data = await get_json(
        f"{settings.finance_service_url}/internal/finance/dsr",
        params={"tenantId": tenant_id, "from": str(from_date), "to": str(to_date)},
    )
    expense_data = await get_json(
        f"{settings.finance_service_url}/internal/finance/expenses",
        params={"tenantId": tenant_id, "from": str(from_date), "to": str(to_date)},
    )

    metrics = _calc_pnl_metrics(
        dsr_data if isinstance(dsr_data, list) else [],
        expense_data if isinstance(expense_data, list) else [],
        from_date,
        to_date,
    )

    expense_breakdown = [
        {"category": cat, "total_amount": str(amt)}
        for cat, amt in sorted(metrics["expense_by_category"].items())
    ]

    return PnlSummary(
        from_date=from_date,
        to_date=to_date,
        gross_sales=metrics["gross_sales"],
        net_sales=metrics["net_sales"],
        total_expenses=metrics["total_expenses"],
        net_profit=metrics["net_profit"],
        food_cost_percentage=metrics["food_cost_percentage"],
        labor_cost_percentage=metrics["labor_cost_percentage"],
        prime_cost_percentage=metrics["prime_cost_percentage"],
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

    rows = waste_data if isinstance(waste_data, list) else []
    metrics = _aggregate_waste_metrics(rows)

    items: list[WasteItem] = []
    for entry in rows:
        cost = _dec(entry.get("estimatedCost") or entry.get("estimated_cost"))
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
        total_waste_cost=metrics["total_waste_cost"],
        category_breakdown=metrics["category_breakdown"],
        trend_by_weekday=metrics["trend_by_weekday"],
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

    hours_by_emp: dict[str, dict[str, Any]] = {}
    for rec in (attendance_data if isinstance(attendance_data, list) else []):
        att = rec.get("attendance", rec)
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


@router.get("/audit-log")
async def audit_log_report(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    user_id: str | None = Query(None, alias="user_id"),
    event_type: str | None = Query(None, alias="event_type"),
    tenant_id: str = Header(..., alias="x-tenant-id"),
) -> dict[str, Any]:
    """Aggregate audit logs across services for a tenant/date range."""
    if to_date < from_date:
        raise ServiceException("INVALID_RANGE", "to date must be >= from date")

    params = {
        "tenantId": tenant_id,
        "from": str(from_date),
        "to": str(to_date),
    }
    if user_id:
        params["userId"] = user_id
    if event_type:
        params["eventType"] = event_type

    sources = [
        ("inventory", f"{settings.inventory_service_url}/internal/audit/logs"),
        ("finance", f"{settings.finance_service_url}/internal/audit/logs"),
        ("staff", f"{settings.staff_service_url}/internal/audit/logs"),
    ]

    combined: list[dict[str, Any]] = []
    for source, url in sources:
        try:
            rows = await get_json(url, params=params)
        except Exception:
            rows = []
        if not isinstance(rows, list):
            continue

        for row in rows:
            ts = row.get("event_time") or row.get("changed_at") or row.get("timestamp")
            combined.append(
                {
                    "source": source,
                    "event_type": row.get("event_type") or row.get("action") or "unknown",
                    "entity": row.get("entity") or row.get("table_name") or "unknown",
                    "entity_id": row.get("entity_id") or row.get("record_id"),
                    "user_id": row.get("user_id") or row.get("changed_by"),
                    "timestamp": ts,
                    "old_values": row.get("old_values"),
                    "new_values": row.get("new_values"),
                }
            )

    combined.sort(key=lambda e: str(e.get("timestamp") or ""), reverse=True)

    return {
        "from_date": from_date,
        "to_date": to_date,
        "count": len(combined),
        "items": combined,
    }


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


def _normalize_report_type(report_type: str) -> str:
    return report_type.strip().lower().replace("_", "-")


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
    report_type = _normalize_report_type(body.report_type)

    if report_type not in VALID_REPORT_TYPES:
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
            "id": job_id,
            "tenant_id": tenant_id,
            "report_type": report_type,
            "params": _json_str(body.parameters),
            "created_by": user_id,
        },
    )
    await db.commit()

    from app.workers.tasks import generate_report  # late import avoids circular deps

    generate_report.delay(job_id, report_type, body.parameters, tenant_id)

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


@router.get("/jobs/{job_id}/download")
async def download_report_job(
    job_id: str,
    tenant_id: str = Header(..., alias="x-tenant-id"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Download a completed report.
    - If the job is completed: HTTP 302 redirect to a fresh 1-hour signed URL.
    - If the job is still processing/queued/pending: HTTP 202 (not ready yet).
    - If the job is not found: HTTP 404.
    """
    result = await db.execute(
        text("""
            SELECT id, status, output_url, error_message
            FROM report_jobs
            WHERE id = :id
              AND tenant_id = :tenant_id
        """),
        {"id": job_id, "tenant_id": tenant_id},
    )
    job = result.fetchone()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "completed":
        return Response(
            content=__import__("json").dumps({"status": job.status, "message": "Report not ready yet"}),
            status_code=202,
            media_type="application/json",
        )

    # Job is completed — generate a short-lived (1h) signed URL
    from app.storage.supabase import get_signed_url

    signed_url = get_signed_url(job_id, tenant_id)
    if not signed_url:
        # Fall back to the stored output_url which may be a longer-lived URL
        signed_url = job.output_url or ""

    if not signed_url:
        raise HTTPException(status_code=500, detail="Report file URL unavailable")

    return RedirectResponse(url=signed_url, status_code=302)


def _json_str(data: dict) -> str:
    import json

    return json.dumps(data)
