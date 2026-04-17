from __future__ import annotations
import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.main import ServiceException
from app.models.ai_job import AiJob
from app.schemas.ai_job import VoiceQueryRequest, VoiceQueryResponse
from app.workers.tasks import _interpret_query_with_openai

router = APIRouter()


def _gateway_headers(
    x_user_id: str = Header(..., alias="x-user-id"),
    x_tenant_id: str = Header(..., alias="x-tenant-id"),
) -> tuple[str, str]:
    return x_user_id, x_tenant_id


@router.post("/voice-query", response_model=VoiceQueryResponse)
async def voice_query(
    body: VoiceQueryRequest,
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> VoiceQueryResponse:
    """
    Interpret a natural-language query against inventory/finance data.
    The OpenAI call is offloaded to a thread so it does not block the event loop.
    """
    if not settings.openai_api_key:
        raise ServiceException("CONFIG_ERROR", "OpenAI API key not configured", 503)

    user_id, tenant_id = headers

    # Persist job for audit trail
    job = AiJob(
        tenant_id=UUID(tenant_id),
        job_type="voice_query",
        status="pending",
        input_data={"query": body.query, "context": body.context},
        created_by=UUID(user_id),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        # _interpret_query_with_openai is a blocking I/O call; run it in the default
        # thread-pool executor so it does not block the asyncio event loop.
        result = await asyncio.to_thread(_interpret_query_with_openai, body.query, body.context)
        job.status = "completed"
        job.result_data = result
        db.commit()
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        db.commit()
        raise ServiceException("AI_ERROR", f"Voice query failed: {exc}", 502)

    return VoiceQueryResponse(
        query=body.query,
        interpreted=result,
        suggestion=result.get("suggestion", ""),
    )
