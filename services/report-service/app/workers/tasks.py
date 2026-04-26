"""
Celery tasks for async report generation.

Flow per task:
  1. Update report_jobs.status → processing
  2. Fetch aggregated data from internal services via HTTP
  3. Generate PDF with reportlab
  4. Upload PDF to Supabase Storage
  5. Update report_jobs.status → completed, set output_url
  6. Publish report.generated event
  7. On any error: status → failed
"""
from __future__ import annotations
import io
import logging
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

import httpx
import psycopg2
from celery import shared_task
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from supabase import create_client

from app.core.config import settings
from app.core.rabbitmq import publish_event

logger = logging.getLogger(__name__)

# Lazy Supabase client — initialised on first use so import doesn't fail in test environments
_supabase_client = None


def _get_supabase():
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.supabase_storage_url or "http://localhost:54321",
            settings.supabase_service_key or "",
        )
    return _supabase_client

_INTERNAL_HEADERS = {"x-internal-secret": settings.internal_service_secret}

# Supported report types → human-readable names
_REPORT_NAMES = {
    "pnl":         "Profit & Loss Report",
    "waste":        "Waste Report",
    "expenses":     "Expense Breakdown",
    "staff-hours":  "Staff Hours Report",
    "inventory-variance": "Inventory Variance Report",
    "food-cost-by-category": "Food Cost by Category Report",
    "labor-cost": "Labor Cost Report",
    "menu-engineering": "Menu Engineering Matrix Report",
    "vendor-spend": "Vendor Spend Analysis Report",
    "splh": "Sales per Labor Hour Report",
    "employee-performance": "Employee Performance Report",
    "audit-log": "Audit Log Report",
}


def _db_conn():
    """Open a synchronous psycopg2 connection for status updates."""
    return psycopg2.connect(settings.database_url)


def _set_status(
    job_id: str,
    status: str,
    output_url: str | None = None,
    error_message: str | None = None,
) -> None:
    terminal = status in ("completed", "failed")
    with _db_conn() as conn:
        with conn.cursor() as cur:
            if output_url and terminal:
                cur.execute(
                    """UPDATE report_jobs
                       SET status=%s, output_url=%s, completed_at=NOW(), updated_at=NOW()
                       WHERE id=%s""",
                    (status, output_url, job_id),
                )
            elif terminal and error_message:
                cur.execute(
                    """UPDATE report_jobs
                       SET status=%s, error_message=%s, completed_at=NOW(), updated_at=NOW()
                       WHERE id=%s""",
                    (status, error_message, job_id),
                )
            elif terminal:
                cur.execute(
                    """UPDATE report_jobs
                       SET status=%s, completed_at=NOW(), updated_at=NOW()
                       WHERE id=%s""",
                    (status, job_id),
                )
            else:
                cur.execute(
                    "UPDATE report_jobs SET status=%s, updated_at=NOW() WHERE id=%s",
                    (status, job_id),
                )
        conn.commit()


def _safe_list_get(url: str, query: dict | None = None) -> list[dict]:
    """GET an internal endpoint and return the response as a list; raises on upstream errors."""
    try:
        resp = httpx.get(url, params=query, headers=_INTERNAL_HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            raise ValueError(f"Expected list from {url}, got {type(data).__name__}")
        return data
    except httpx.HTTPStatusError as e:
        logger.error("Upstream %s returned %d: %s", url, e.response.status_code, e.response.text[:200])
        raise
    except Exception as e:
        logger.error("Failed to fetch %s: %s", url, e)
        raise


def _fetch_data(report_type: str, params: dict, tenant_id: str) -> list:
    """Fetch aggregated data from the relevant internal service."""
    from_date = params.get("from", "")
    to_date   = params.get("to", "")
    common    = {"tenantId": tenant_id, "from": from_date, "to": to_date}
    two = Decimal("0.01")

    if report_type == "pnl":
        url = f"{settings.finance_service_url}/internal/finance/pl-data"
        try:
            r = httpx.get(url, params={"tenantId": tenant_id, "start": from_date, "end": to_date},
                          headers=_INTERNAL_HEADERS, timeout=30)
            r.raise_for_status()
            data = r.json()
            return [data.get("data", data)]  # return as list for consistent interface
        except Exception as e:
            logger.warning("Failed to fetch PL data: %s", e)
            return []

    if report_type == "waste":
        data = _safe_list_get(f"{settings.inventory_service_url}/internal/inventory/waste", common)
        return data if isinstance(data, list) else []

    if report_type == "expenses":
        data = _safe_list_get(
            f"{settings.finance_service_url}/internal/finance/expenses",
            {"tenantId": tenant_id, "from": from_date, "to": to_date},
        )
        return data if isinstance(data, list) else []

    if report_type == "staff-hours":
        data = _safe_list_get(f"{settings.staff_service_url}/internal/staff/attendance", common)
        return data if isinstance(data, list) else []

    if report_type == "inventory-variance":
        counts = _safe_list_get(f"{settings.inventory_service_url}/internal/inventory/counts", common)
        rows: list[dict] = []
        for row in counts:
            expected = Decimal(str(row.get("expected_quantity") or row.get("system_quantity") or 0))
            actual = Decimal(str(row.get("actual_quantity") or row.get("counted_quantity") or 0))
            variance = (actual - expected).quantize(two, rounding=ROUND_HALF_UP)
            rows.append(
                {
                    "item_name": row.get("item_name") or row.get("itemName") or str(row.get("item_id", "")),
                    "expected_qty": float(expected),
                    "actual_qty": float(actual),
                    "variance_qty": float(variance),
                    "variance_pct": float(((variance / expected) * 100).quantize(two, rounding=ROUND_HALF_UP)) if expected else 0.0,
                }
            )
        return rows

    if report_type == "food-cost-by-category":
        expenses = _safe_list_get(f"{settings.finance_service_url}/internal/finance/expenses")
        dsr = _safe_list_get(f"{settings.finance_service_url}/internal/finance/dsr")
        revenue = sum(Decimal(str(d.get("netSales") or d.get("net_sales") or 0)) for d in dsr)
        by_category: dict[str, Decimal] = defaultdict(Decimal)
        for e in expenses:
            category = str(e.get("category") or "other")
            by_category[category] += Decimal(str(e.get("amount") or 0))
        rows = []
        for category, amount in sorted(by_category.items()):
            pct = ((amount / revenue) * 100).quantize(two, rounding=ROUND_HALF_UP) if revenue else Decimal("0.00")
            rows.append({"category": category, "cost_amount": float(amount), "cost_pct_of_revenue": float(pct)})
        return rows

    if report_type == "labor-cost":
        expenses = _safe_list_get(f"{settings.finance_service_url}/internal/finance/expenses")
        dsr = _safe_list_get(f"{settings.finance_service_url}/internal/finance/dsr")
        revenue = sum(Decimal(str(d.get("netSales") or d.get("net_sales") or 0)) for d in dsr)
        labor = Decimal("0")
        for e in expenses:
            category = str(e.get("category") or "").lower()
            if category in {"labor", "payroll", "wages", "salary", "staff"}:
                labor += Decimal(str(e.get("amount") or 0))
        pct = ((labor / revenue) * 100).quantize(two, rounding=ROUND_HALF_UP) if revenue else Decimal("0.00")
        return [{"labor_cost": float(labor), "revenue": float(revenue), "labor_pct": float(pct)}]

    if report_type == "menu-engineering":
        items = _safe_list_get(f"{settings.inventory_service_url}/internal/inventory/recipes")
        return [
            {
                "menu_item": i.get("name") or i.get("item_name"),
                "recipe_cost": i.get("cost") or i.get("recipe_cost") or 0,
                "classification": "unknown",
            }
            for i in items
        ]

    if report_type == "vendor-spend":
        expenses = _safe_list_get(f"{settings.finance_service_url}/internal/finance/expenses")
        by_vendor: dict[str, Decimal] = defaultdict(Decimal)
        for e in expenses:
            vendor = str(e.get("vendor_name") or e.get("vendorId") or e.get("vendor_id") or "unknown")
            by_vendor[vendor] += Decimal(str(e.get("amount") or 0))
        return [{"vendor": v, "total_spend": float(a)} for v, a in sorted(by_vendor.items(), key=lambda x: x[1], reverse=True)]

    if report_type == "splh":
        dsr = _safe_list_get(f"{settings.finance_service_url}/internal/finance/dsr")
        attendance = _safe_list_get(f"{settings.staff_service_url}/internal/staff/attendance")
        revenue = sum(Decimal(str(d.get("netSales") or d.get("net_sales") or 0)) for d in dsr)
        hours = sum(Decimal(str(a.get("hoursWorked") or a.get("hours_worked") or 0)) for a in attendance)
        splh = (revenue / hours).quantize(two, rounding=ROUND_HALF_UP) if hours else Decimal("0.00")
        return [{"revenue": float(revenue), "labor_hours": float(hours), "splh": float(splh)}]

    if report_type == "employee-performance":
        attendance = _safe_list_get(f"{settings.staff_service_url}/internal/staff/attendance")
        by_employee: dict[str, dict] = {}
        for rec in attendance:
            employee_id = str(rec.get("employeeId") or rec.get("employee_id") or "unknown")
            by_employee.setdefault(employee_id, {"employee_id": employee_id, "hours": Decimal("0"), "shifts": 0})
            by_employee[employee_id]["hours"] += Decimal(str(rec.get("hoursWorked") or rec.get("hours_worked") or 0))
            by_employee[employee_id]["shifts"] += 1
        return [
            {"employee_id": e["employee_id"], "total_hours": float(e["hours"]), "shift_count": e["shifts"]}
            for e in by_employee.values()
        ]

    if report_type == "audit-log":
        data = _safe_list_get(f"{settings.finance_service_url}/internal/audit/logs")
        return data if isinstance(data, list) else []

    return []


def _generate_pdf(report_type: str, report_name: str, data: list, params: dict) -> bytes:
    """Generate a simple PDF report with reportlab and return as bytes."""
    if report_type == "pnl" and data:
        from app.generators.pl_generator import generate as gen_pl
        return gen_pl(data[0], params.get("from", ""), params.get("to", ""))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # Header
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, report_name)
    c.setFont("Helvetica", 11)
    c.drawString(50, height - 75,
                 f"Period: {params.get('from', '')} to {params.get('to', '')}")
    c.drawString(50, height - 90,
                 f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    # Body — simple row listing
    y = height - 130
    c.setFont("Helvetica", 10)
    if len(data) > 500:
        logger.warning("Report job truncated: %d rows received, rendering first 500", len(data))
    for row in data[:500]:
        text = " | ".join(f"{k}: {v}" for k, v in list(row.items())[:4])
        c.drawString(50, y, text[:120])
        y -= 15
        if y < 60:
            c.showPage()
            y = height - 50

    c.save()
    return buf.getvalue()


def _upload_pdf(job_id: str, tenant_id: str, pdf_bytes: bytes) -> str:
    """Upload PDF to Supabase Storage and return a signed URL."""
    client = _get_supabase()
    bucket = "reports"
    path   = f"{tenant_id}/{job_id}.pdf"
    client.storage.from_(bucket).upload(path, pdf_bytes,
                                        file_options={"content-type": "application/pdf"})
    result = client.storage.from_(bucket).create_signed_url(path, expires_in=86400)
    return result.get("signedURL") or result.get("signedUrl", "")


@shared_task(
    name="report_service.generate_report",
    bind=True,
    max_retries=3,
    acks_late=True,
    reject_on_worker_lost=True,
)
def generate_report(self, job_id: str, report_type: str, params: dict, tenant_id: str) -> None:
    """
    Generate a report PDF and store it in Supabase Storage.
    Updates report_jobs status throughout: pending → processing → completed/failed.
    Retries up to 3 times with exponential backoff (60s, 120s, 240s, capped at 600s).
    """
    report_name = _REPORT_NAMES.get(report_type, report_type.capitalize() + " Report")
    logger.info("generate_report: starting job=%s type=%s tenant=%s attempt=%d",
                job_id, report_type, tenant_id, self.request.retries)

    try:
        _set_status(job_id, "processing")

        data = _fetch_data(report_type, params, tenant_id)
        pdf_bytes = _generate_pdf(report_type, report_name, data, params)
        output_url = _upload_pdf(job_id, tenant_id, pdf_bytes)

        _set_status(job_id, "completed", output_url)

        publish_event("report.generated", tenant_id, {
            "job_id":      job_id,
            "report_name": report_name,
            "url":         output_url,
        })
        logger.info("generate_report: completed job=%s url=%s", job_id, output_url)

    except Exception as exc:
        logger.error("generate_report: failed job=%s attempt=%d error=%s",
                     job_id, self.request.retries, exc, exc_info=True)
        if self.request.retries < self.max_retries:
            countdown = min(60 * (2 ** self.request.retries), 600)
            raise self.retry(exc=exc, countdown=countdown)
        # Final failure after all retries exhausted
        try:
            _set_status(job_id, "failed", error_message=str(exc)[:500])
        except Exception:
            pass  # DB might be unreachable; best effort
        raise


@shared_task(name="report_service.cleanup_stuck_jobs")
def cleanup_stuck_jobs() -> None:
    """Mark report jobs stuck in 'processing' for > 30 minutes as failed."""
    try:
        with _db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE report_jobs
                    SET status = 'failed',
                        error_message = 'Job timed out after 30 minutes of processing',
                        completed_at = NOW(),
                        updated_at = NOW()
                    WHERE status = 'processing'
                      AND created_at < now() - INTERVAL '30 minutes'
                """)
            conn.commit()
        logger.info("cleanup_stuck_jobs: completed")
    except Exception:
        logger.exception("cleanup_stuck_jobs: failed")
        raise
