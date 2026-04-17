"""
Celery tasks for the AI service.
Each task follows: update status → do work → update result → publish event.
"""
from __future__ import annotations
import logging
import io
from typing import Any

import httpx

from app.workers.celery_app import celery_app
from app.core.database import SessionLocal
from app.core.config import settings
from app.core.rabbitmq import publish_event
from app.models.ai_job import AiJob

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_job(db, job_id: str) -> AiJob:
    job = db.query(AiJob).filter(AiJob.id == job_id).first()
    if not job:
        raise ValueError(f"AiJob {job_id} not found")
    return job


def _mark_processing(db, job: AiJob) -> None:
    job.status = "processing"
    db.commit()


def _mark_completed(db, job: AiJob, result: dict[str, Any]) -> None:
    job.status = "completed"
    job.result_data = result
    db.commit()


def _mark_failed(db, job: AiJob, error: str) -> None:
    job.status = "failed"
    job.error_message = error
    db.commit()


def _download_file(url: str) -> tuple[bytes, str]:
    """Download a file and return (content, content_type)."""
    with httpx.Client(timeout=30) as client:
        resp = client.get(url)
        resp.raise_for_status()
    return resp.content, resp.headers.get("content-type", "application/octet-stream")


# ── OCR task ───────────────────────────────────────────────────────────────

@celery_app.task(name="tasks.process_ocr", bind=True, max_retries=3)
def process_ocr(self, job_id: str, file_url: str, tenant_id: str):
    """
    Download the file and run OCR.
    Uses Mindee if configured; falls back to Google Vision if not.
    """
    logger.info("OCR task started: job_id=%s tenant=%s", job_id, tenant_id)
    db = SessionLocal()
    try:
        job = _get_job(db, job_id)
        _mark_processing(db, job)

        # Download file
        file_bytes, content_type = _download_file(file_url)

        result: dict[str, Any]
        if settings.mindee_api_key:
            result = _run_mindee_ocr(file_bytes, job.input_data.get("document_type", "receipt"))
        elif settings.google_cloud_credentials:
            result = _run_google_vision_ocr(file_bytes)
        else:
            raise RuntimeError("No OCR provider configured (set MINDEE_API_KEY or GOOGLE_CLOUD_CREDENTIALS)")

        _mark_completed(db, job, result)

        publish_event(
            "ai.ocr.completed",
            tenant_id,
            {
                "job_id": job_id,
                "file_upload_id": job.input_data.get("file_upload_id"),
                "document_type": job.input_data.get("document_type"),
                "result": result,
            },
        )
        logger.info("OCR task completed: job_id=%s", job_id)

    except Exception as exc:
        logger.exception("OCR task failed: job_id=%s", job_id)
        db.rollback()
        try:
            job = _get_job(db, job_id)
            _mark_failed(db, job, str(exc))
        except Exception:
            pass
        raise self.retry(exc=exc, countdown=30)
    finally:
        db.close()


def _run_mindee_ocr(file_bytes: bytes, document_type: str) -> dict[str, Any]:
    """Call Mindee API for receipt/invoice parsing."""
    from mindee import Client, product

    client = Client(api_key=settings.mindee_api_key)
    file_obj = io.BytesIO(file_bytes)

    if document_type == "invoice":
        input_source = client.source_from_bytes(file_bytes, "document.pdf")
        result = client.parse(product.InvoiceV4, input_source)
        pred = result.document.inference.prediction
        return {
            "provider": "mindee",
            "document_type": "invoice",
            "vendor_name": str(pred.supplier_name) if pred.supplier_name else None,
            "invoice_date": str(pred.date) if pred.date else None,
            "invoice_number": str(pred.invoice_number) if pred.invoice_number else None,
            "total_amount": float(pred.total_amount.value) if pred.total_amount and pred.total_amount.value else None,
            "tax_amount": float(pred.total_tax.value) if pred.total_tax and pred.total_tax.value else None,
            "line_items": [
                {
                    "description": str(item.description) if item.description else None,
                    "quantity": float(item.quantity.value) if item.quantity and item.quantity.value else None,
                    "unit_price": float(item.unit_price.value) if item.unit_price and item.unit_price.value else None,
                    "total_amount": float(item.total_amount.value) if item.total_amount and item.total_amount.value else None,
                }
                for item in (pred.line_items or [])
            ],
        }
    else:
        # Default: receipt
        input_source = client.source_from_bytes(file_bytes, "receipt.jpg")
        result = client.parse(product.ReceiptV5, input_source)
        pred = result.document.inference.prediction
        return {
            "provider": "mindee",
            "document_type": "receipt",
            "vendor_name": str(pred.supplier_name) if pred.supplier_name else None,
            "receipt_date": str(pred.date) if pred.date else None,
            "total_amount": float(pred.total_amount.value) if pred.total_amount and pred.total_amount.value else None,
            "tax_amount": float(pred.total_tax.value) if pred.total_tax and pred.total_tax.value else None,
            "category": str(pred.category) if pred.category else None,
            "line_items": [
                {
                    "description": str(item.description) if item.description else None,
                    "quantity": float(item.quantity.value) if item.quantity and item.quantity.value else None,
                    "unit_price": float(item.unit_price.value) if item.unit_price and item.unit_price.value else None,
                    "total_amount": float(item.total_amount.value) if item.total_amount and item.total_amount.value else None,
                }
                for item in (pred.line_items or [])
            ],
        }


def _run_google_vision_ocr(file_bytes: bytes) -> dict[str, Any]:
    """Call Google Cloud Vision for text detection."""
    from google.cloud import vision as gcv

    client = gcv.ImageAnnotatorClient()
    image = gcv.Image(content=file_bytes)
    response = client.document_text_detection(image=image)

    if response.error.message:
        raise RuntimeError(f"Google Vision error: {response.error.message}")

    full_text = response.full_text_annotation.text if response.full_text_annotation else ""
    return {
        "provider": "google_vision",
        "full_text": full_text,
        "pages": len(response.full_text_annotation.pages) if response.full_text_annotation else 0,
    }


# ── Voice query task ────────────────────────────────────────────────────────

@celery_app.task(name="tasks.process_voice_query", bind=True, max_retries=2)
def process_voice_query(self, job_id: str, query: str, context: str | None, tenant_id: str):
    """
    Interpret a natural-language query using OpenAI and map it to a structured
    KitchenLedger query.
    """
    logger.info("Voice query task started: job_id=%s tenant=%s", job_id, tenant_id)
    db = SessionLocal()
    try:
        job = _get_job(db, job_id)
        _mark_processing(db, job)

        result = _interpret_query_with_openai(query, context)
        _mark_completed(db, job, result)

        logger.info("Voice query task completed: job_id=%s", job_id)

    except Exception as exc:
        logger.exception("Voice query task failed: job_id=%s", job_id)
        db.rollback()
        try:
            job = _get_job(db, job_id)
            _mark_failed(db, job, str(exc))
        except Exception:
            pass
        raise self.retry(exc=exc, countdown=15)
    finally:
        db.close()


def _interpret_query_with_openai(query: str, context: str | None) -> dict[str, Any]:
    """
    Use OpenAI to map a natural-language query to a structured intent.
    Returns intent, filters, and a human-readable suggestion.
    """
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    system_prompt = (
        "You are a restaurant management assistant for KitchenLedger. "
        "Given a natural-language query, extract a structured intent with filters. "
        "Return valid JSON with keys: intent (string), filters (object), suggestion (string). "
        "Intents: get_inventory, get_low_stock, get_expenses, get_sales, get_staff_hours, get_waste. "
        "Example: {\"intent\": \"get_low_stock\", \"filters\": {\"category\": \"vegetables\"}, "
        "\"suggestion\": \"Showing items below PAR level in the vegetables category\"}"
    )
    context_hint = f" Context: {context}." if context else ""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt + context_hint},
            {"role": "user", "content": query},
        ],
        max_tokens=256,
        temperature=0,
    )

    import json
    raw = response.choices[0].message.content or "{}"
    parsed = json.loads(raw)
    return {
        "intent": parsed.get("intent", "unknown"),
        "filters": parsed.get("filters", {}),
        "suggestion": parsed.get("suggestion", ""),
        "original_query": query,
    }
