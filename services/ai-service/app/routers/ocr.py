from __future__ import annotations
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import AccessDeniedException, NotFoundException
from app.models.ai_job import AiJob
from app.schemas.ai_job import OcrRequest, OcrSubmitResponse, JobResponse
from app.workers.tasks import process_ocr

router = APIRouter()


def _gateway_headers(
    x_user_id: str = Header(..., alias="x-user-id"),
    x_tenant_id: str = Header(..., alias="x-tenant-id"),
) -> tuple[str, str]:
    return x_user_id, x_tenant_id


@router.post("/ocr", response_model=OcrSubmitResponse, status_code=202)
def submit_ocr(
    body: OcrRequest,
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> OcrSubmitResponse:
    """
    Submit a document for OCR processing.
    Returns immediately with a job_id; poll GET /jobs/{id} for results.
    """
    user_id, tenant_id = headers

    job = AiJob(
        tenant_id=UUID(tenant_id),
        job_type="ocr",
        status="pending",
        input_data={
            "file_upload_id": body.file_upload_id,
            "file_url": body.file_url,
            "document_type": body.document_type,
        },
        created_by=UUID(user_id),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Queue the Celery task — runs asynchronously
    process_ocr.delay(str(job.id), body.file_url, tenant_id)

    return OcrSubmitResponse(job_id=job.id, status=job.status)
