from __future__ import annotations
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import NotFoundException
from app.models.ai_job import AiJob
from app.schemas.ai_job import JobResponse

router = APIRouter()


def _gateway_headers(
    x_tenant_id: str = Header(..., alias="x-tenant-id"),
) -> str:
    return x_tenant_id


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(_gateway_headers),
) -> JobResponse:
    """Poll the status and result of an AI job."""
    job = (
        db.query(AiJob)
        .filter(AiJob.id == job_id, AiJob.tenant_id == UUID(tenant_id))
        .first()
    )
    if not job:
        raise NotFoundException(f"Job {job_id} not found")
    return JobResponse.model_validate(job)
