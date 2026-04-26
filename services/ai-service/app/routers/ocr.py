"""
OCR routers — handwritten notebook (AI-2) and receipt (AI-3).

Endpoints:
  POST /api/ai/ocr/notebook               — submit notebook scan job
  GET  /api/ai/ocr/notebook/{job_id}      — poll notebook job
  POST /api/ai/ocr/notebook/{job_id}/commit — apply results to inventory/finance
  POST /api/ai/ocr/receipt                — submit receipt OCR job
  GET  /api/ai/ocr/receipt/{job_id}       — poll receipt job
"""
from __future__ import annotations

import uuid as _uuid
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.ai_job import AiJob
from app.schemas.ai_job import (
    CommitItems,
    CommitResponse,
    NotebookOcrJobResponse,
    NotebookOcrSubmitResponse,
    ReceiptOcrSubmitResponse,
)
from app.workers.ocr_tasks import process_notebook_ocr, process_receipt_ocr

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


# ── Header dependency ──────────────────────────────────────────────────────

def _gateway_headers(
    x_user_id: str = Header(..., alias="x-user-id"),
    x_tenant_id: str = Header(..., alias="x-tenant-id"),
) -> tuple[str, str]:
    return x_user_id, x_tenant_id


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_job_or_404(db: Session, job_id: UUID, tenant_id: str) -> AiJob:
    job = (
        db.query(AiJob)
        .filter(AiJob.id == job_id, AiJob.tenant_id == UUID(tenant_id))
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


def _validate_image(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type {file.content_type!r}. Must be JPEG, PNG, or WebP.",
        )


async def _upload_to_file_service(
    file_bytes: bytes,
    filename: str,
    content_type: str,
    tenant_id: str,
) -> str:
    """Upload image bytes to File Service and return the public/signed URL."""
    import httpx
    from app.core.config import settings

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{settings.file_service_url}/internal/files/upload",
                files={"file": (filename, file_bytes, content_type)},
                headers={
                    "X-Internal-Secret": settings.internal_service_secret,
                    "X-Tenant-Id": tenant_id,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("url") or data.get("file_url") or ""
    except Exception as exc:
        # Fall back: return a data URL or raise
        raise HTTPException(status_code=502, detail=f"File upload failed: {exc}") from exc


# ── AI-2: Notebook OCR ─────────────────────────────────────────────────────

@router.post(
    "/ocr/notebook",
    response_model=NotebookOcrSubmitResponse,
    status_code=201,
    summary="Submit a handwritten notebook image for OCR",
)
async def submit_notebook_ocr(
    image: Annotated[UploadFile, File(description="JPEG/PNG/WebP image, max 20MB")],
    context_type: Annotated[str, Form()] = "inventory",
    target_date: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> NotebookOcrSubmitResponse:
    user_id, tenant_id = headers

    _validate_image(image)
    file_bytes = await image.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File exceeds 20 MB limit")

    if context_type not in ("inventory", "expense"):
        raise HTTPException(status_code=422, detail="context_type must be 'inventory' or 'expense'")

    # Upload to File Service
    file_url = await _upload_to_file_service(
        file_bytes,
        image.filename or "notebook.jpg",
        image.content_type or "image/jpeg",
        tenant_id,
    )

    # Create job record
    job = AiJob(
        tenant_id=UUID(tenant_id),
        user_id=UUID(user_id),
        job_type="notebook_ocr",
        status="pending",
        input_data={
            "file_url": file_url,
            "context_type": context_type,
            "target_date": target_date,
        },
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Dispatch Celery task
    process_notebook_ocr.delay(str(job.id), file_url, tenant_id, context_type)

    return NotebookOcrSubmitResponse(
        job_id=job.id,
        status=job.status,
        estimated_seconds=8,
    )


@router.get(
    "/ocr/notebook/{job_id}",
    response_model=NotebookOcrJobResponse,
    summary="Poll status of a notebook OCR job",
)
def get_notebook_ocr_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> NotebookOcrJobResponse:
    _, tenant_id = headers
    job = _get_job_or_404(db, job_id, tenant_id)
    return NotebookOcrJobResponse(
        job_id=job.id,
        status=job.status,
        result=job.result,
        error_message=job.error_message,
    )


@router.post(
    "/ocr/notebook/{job_id}/commit",
    response_model=CommitResponse,
    summary="Commit OCR results to inventory / finance",
)
async def commit_notebook_ocr(
    job_id: UUID,
    body: CommitItems,
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> CommitResponse:
    user_id, tenant_id = headers
    job = _get_job_or_404(db, job_id, tenant_id)

    if job.status != "completed":
        raise HTTPException(status_code=409, detail="Job is not in 'completed' state")

    updated_items = 0
    created_expenses = 0
    created_items = 0

    # Apply inventory stock updates
    if body.items_to_update:
        from app.clients.inventory_client import update_stock
        try:
            await update_stock(tenant_id, user_id, body.items_to_update)
            updated_items = len(body.items_to_update)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Inventory update failed: {exc}") from exc

    # Create expenses in Finance Service
    if body.expenses_to_create:
        from app.clients.finance_client import create_expense
        for expense in body.expenses_to_create:
            try:
                await create_expense(tenant_id, user_id, expense)
                created_expenses += 1
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Expense creation failed: {exc}") from exc

    # Mark job as applied
    existing_result = job.result or {}
    job.result = {**existing_result, "committed": True}
    db.commit()

    return CommitResponse(
        committed=True,
        updated_items=updated_items,
        created_expenses=created_expenses,
        created_items=created_items,
    )


# ── AI-3: Receipt OCR ──────────────────────────────────────────────────────

@router.post(
    "/ocr/receipt",
    response_model=ReceiptOcrSubmitResponse,
    status_code=201,
    summary="Submit a receipt/invoice image for Mindee OCR",
)
async def submit_receipt_ocr(
    image: Annotated[UploadFile, File(description="JPEG/PNG/WebP receipt image, max 20MB")],
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> ReceiptOcrSubmitResponse:
    user_id, tenant_id = headers

    _validate_image(image)
    file_bytes = await image.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File exceeds 20 MB limit")

    file_url = await _upload_to_file_service(
        file_bytes,
        image.filename or "receipt.jpg",
        image.content_type or "image/jpeg",
        tenant_id,
    )

    job = AiJob(
        tenant_id=UUID(tenant_id),
        user_id=UUID(user_id),
        job_type="receipt_ocr",
        status="pending",
        input_data={"file_url": file_url, "context_type": "receipt"},
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    process_receipt_ocr.delay(str(job.id), file_url, tenant_id)

    return ReceiptOcrSubmitResponse(
        job_id=job.id,
        status=job.status,
        estimated_seconds=5,
    )


@router.get(
    "/ocr/receipt/{job_id}",
    response_model=NotebookOcrJobResponse,
    summary="Poll status of a receipt OCR job",
)
def get_receipt_ocr_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> NotebookOcrJobResponse:
    _, tenant_id = headers
    job = _get_job_or_404(db, job_id, tenant_id)
    return NotebookOcrJobResponse(
        job_id=job.id,
        status=job.status,
        result=job.result,
        error_message=job.error_message,
    )
