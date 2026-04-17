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
from datetime import datetime, timezone

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
}


def _db_conn():
    """Open a synchronous psycopg2 connection for status updates."""
    return psycopg2.connect(settings.database_url)


def _set_status(job_id: str, status: str, output_url: str | None = None) -> None:
    with _db_conn() as conn:
        with conn.cursor() as cur:
            if output_url:
                cur.execute(
                    "UPDATE report_jobs SET status=%s, output_url=%s, updated_at=NOW() WHERE id=%s",
                    (status, output_url, job_id),
                )
            else:
                cur.execute(
                    "UPDATE report_jobs SET status=%s, updated_at=NOW() WHERE id=%s",
                    (status, job_id),
                )
        conn.commit()


def _fetch_data(report_type: str, params: dict, tenant_id: str) -> list:
    """Fetch aggregated data from the relevant internal service."""
    from_date = params.get("from", "")
    to_date   = params.get("to", "")
    common    = {"tenantId": tenant_id, "from": from_date, "to": to_date}

    if report_type == "pnl":
        dsr = httpx.get(
            f"{settings.finance_service_url}/internal/finance/dsr",
            params=common, headers=_INTERNAL_HEADERS, timeout=30,
        ).json()
        return dsr if isinstance(dsr, list) else []

    if report_type == "waste":
        data = httpx.get(
            f"{settings.inventory_service_url}/internal/inventory/waste",
            params=common, headers=_INTERNAL_HEADERS, timeout=30,
        ).json()
        return data if isinstance(data, list) else []

    if report_type == "expenses":
        data = httpx.get(
            f"{settings.finance_service_url}/internal/finance/expenses",
            params={"tenantId": tenant_id}, headers=_INTERNAL_HEADERS, timeout=30,
        ).json()
        return data if isinstance(data, list) else []

    if report_type == "staff-hours":
        data = httpx.get(
            f"{settings.staff_service_url}/internal/staff/attendance",
            params=common, headers=_INTERNAL_HEADERS, timeout=30,
        ).json()
        return data if isinstance(data, list) else []

    return []


def _generate_pdf(report_type: str, report_name: str, data: list, params: dict) -> bytes:
    """Generate a simple PDF report with reportlab and return as bytes."""
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
    for row in data[:50]:  # cap at 50 rows to avoid overflow
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


@shared_task(name="report_service.generate_report")
def generate_report(job_id: str, report_type: str, params: dict, tenant_id: str) -> None:
    """
    Generate a report PDF and store it in Supabase Storage.
    Updates report_jobs status throughout: pending → processing → completed/failed.
    """
    report_name = _REPORT_NAMES.get(report_type, report_type.capitalize() + " Report")
    logger.info("generate_report: starting job=%s type=%s tenant=%s", job_id, report_type, tenant_id)

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
        logger.error("generate_report: failed job=%s error=%s", job_id, exc, exc_info=True)
        try:
            _set_status(job_id, "failed")
        except Exception:
            pass  # DB might be unreachable; best effort
