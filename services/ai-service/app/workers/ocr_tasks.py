"""
Celery tasks for the OCR pipeline (notebook + receipt).
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from app.workers.celery_app import celery_app
from app.core.database import SessionLocal
from app.core.config import settings
from app.core.rabbitmq import publish_event
from app.models.ai_job import AiJob

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_job(db, job_id: str, tenant_id: str) -> AiJob:
    # Include tenant_id in the query to prevent cross-tenant job access if a
    # worker is somehow dispatched with a mismatched job_id.
    from uuid import UUID
    job = db.query(AiJob).filter(
        AiJob.id == UUID(job_id),
        AiJob.tenant_id == UUID(tenant_id),
    ).first()
    if not job:
        raise ValueError(f"AiJob {job_id} not found for tenant {tenant_id}")
    return job


def _mark_processing(db, job: AiJob) -> None:
    job.status = "processing"
    db.commit()


def _mark_completed(db, job: AiJob, result: dict[str, Any], model_used: str | None = None,
                    tokens_used: int | None = None, processing_ms: int | None = None) -> None:
    job.status = "completed"
    job.result = result
    if model_used:
        job.model_used = model_used
    if tokens_used is not None:
        job.tokens_used = tokens_used
    if processing_ms is not None:
        job.processing_ms = processing_ms
    db.commit()


def _mark_failed(db, job: AiJob, error: str) -> None:
    job.status = "failed"
    job.error_message = error[:2000]
    db.commit()


def _download_file(url: str) -> bytes:
    with httpx.Client(timeout=30) as client:
        resp = client.get(url)
        resp.raise_for_status()
    return resp.content


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── AI-2: Notebook OCR Task ────────────────────────────────────────────────

@celery_app.task(
    name="ocr_tasks.process_notebook_ocr",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
    reject_on_worker_lost=True,
)
def process_notebook_ocr(
    self,
    job_id: str,
    file_url: str,
    tenant_id: str,
    context_type: str = "inventory",
):
    """
    Full notebook OCR pipeline:
      download → preprocess → Vision OCR → fetch catalog → GPT-4o parse → match catalog
      → update job → publish ai.ocr.completed
    """
    logger.info(
        "notebook_ocr started: job_id=%s tenant=%s attempt=%d",
        job_id, tenant_id, self.request.retries,
    )
    start_ms = int(time.time() * 1000)
    db = SessionLocal()
    try:
        job = _get_job(db, job_id, tenant_id)
        _mark_processing(db, job)

        # 1. Download image
        image_bytes = _download_file(file_url)

        # 2. Preprocess for OCR
        from app.services.ocr_service import preprocess_image, extract_text, parse_with_gpt4o, match_to_catalog
        processed = preprocess_image(image_bytes)

        # 3. Google Vision OCR
        raw_text = extract_text(processed)

        # 4. Fetch tenant item catalog
        from app.clients.inventory_client import get_item_names
        known_items: list[str] = []
        try:
            known_items = _run_async(get_item_names(tenant_id))
        except Exception as e:
            logger.warning("Could not fetch catalog: %s", e)

        # 5. GPT-4o parse
        parsed = parse_with_gpt4o(raw_text, processed, context_type, known_items)

        # 6. Match to catalog (only for inventory)
        if context_type == "inventory":
            items_raw = parsed.get("items", [])
            match_result = _run_async(match_to_catalog(items_raw, tenant_id))
        else:
            match_result = {"matched": [], "unmatched": []}

        elapsed_ms = int(time.time() * 1000) - start_ms
        result = {
            "context_type": context_type,
            "raw_text": raw_text,
            "parsed": parsed,
            "catalog_match": match_result,
            "confidence": parsed.get("confidence", 0.0),
        }

        _mark_completed(db, job, result, model_used="gpt-4o", processing_ms=elapsed_ms)

        publish_event(
            "ai.ocr.completed",
            tenant_id,
            {
                "job_id": job_id,
                "context_type": context_type,
                "matched_items": match_result.get("matched", []),
                "unmatched_items": match_result.get("unmatched", []),
                "parsed_expenses": parsed.get("expenses", []),
                "confidence": parsed.get("confidence", 0.0),
            },
        )
        logger.info("notebook_ocr completed: job_id=%s elapsed_ms=%d", job_id, elapsed_ms)

    except Exception as exc:
        logger.exception("notebook_ocr failed: job_id=%s attempt=%d", job_id, self.request.retries)
        db.rollback()
        countdown = min(10 * (2 ** self.request.retries), 120)
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=countdown)
        try:
            job = _get_job(db, job_id, tenant_id)
            _mark_failed(db, job, str(exc))
        except Exception as mark_exc:
            logger.error("Failed to mark job %s as failed: %s", job_id, mark_exc)
        raise
    finally:
        db.close()


# ── AI-3: Receipt OCR Task ─────────────────────────────────────────────────

@celery_app.task(
    name="ocr_tasks.process_receipt_ocr",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
    reject_on_worker_lost=True,
)
def process_receipt_ocr(self, job_id: str, file_url: str, tenant_id: str):
    """
    Receipt OCR pipeline via Mindee:
      download → Mindee parse → match vendor → match PO → flag discrepancies
      → update job → publish ai.ocr.completed
    """
    logger.info(
        "receipt_ocr started: job_id=%s tenant=%s attempt=%d",
        job_id, tenant_id, self.request.retries,
    )
    start_ms = int(time.time() * 1000)
    db = SessionLocal()
    try:
        job = _get_job(db, job_id, tenant_id)
        _mark_processing(db, job)

        image_bytes = _download_file(file_url)

        from app.services.receipt_service import (
            parse_receipt,
            match_vendor,
            match_po,
            flag_price_discrepancies,
        )

        receipt_data = _run_async(parse_receipt(image_bytes))
        vendor_id = _run_async(match_vendor(tenant_id, receipt_data.get("vendor_name", "")))
        po_data = _run_async(
            match_po(tenant_id, receipt_data.get("invoice_number", ""))
        )

        discrepancies: list[dict] = []
        if po_data and receipt_data.get("line_items"):
            discrepancies = flag_price_discrepancies(
                receipt_data["line_items"],
                po_data.get("line_items", []),
            )

        elapsed_ms = int(time.time() * 1000) - start_ms
        result = {
            **receipt_data,
            "vendor_id": vendor_id,
            "matched_po": po_data,
            "price_discrepancies": discrepancies,
        }

        _mark_completed(db, job, result, model_used="mindee/receipt-v5", processing_ms=elapsed_ms)

        publish_event(
            "ai.ocr.completed",
            tenant_id,
            {
                "job_id": job_id,
                "context_type": "receipt",
                "vendor_id": vendor_id,
                "invoice_number": receipt_data.get("invoice_number"),
                "total_amount": receipt_data.get("total_amount"),
                "line_items": receipt_data.get("line_items", []),
                "discrepancies": discrepancies,
            },
        )
        logger.info("receipt_ocr completed: job_id=%s elapsed_ms=%d", job_id, elapsed_ms)

    except Exception as exc:
        logger.exception("receipt_ocr failed: job_id=%s attempt=%d", job_id, self.request.retries)
        db.rollback()
        countdown = min(10 * (2 ** self.request.retries), 120)
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=countdown)
        try:
            job = _get_job(db, job_id, tenant_id)
            _mark_failed(db, job, str(exc))
        except Exception as mark_exc:
            logger.error("Failed to mark job %s as failed: %s", job_id, mark_exc)
        raise
    finally:
        db.close()
