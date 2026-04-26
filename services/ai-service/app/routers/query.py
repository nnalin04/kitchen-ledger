"""
Natural Language Query router (AI-5).

Endpoint:
  POST /api/ai/query — synchronous NL query with Redis caching (TTL 60 min)
"""
from __future__ import annotations

import hashlib
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.models.ai_job import AiJob
from app.schemas.ai_job import NlQueryRequest, NlQueryResponse

router = APIRouter()


def _gateway_headers(
    x_user_id: str = Header(..., alias="x-user-id"),
    x_tenant_id: str = Header(..., alias="x-tenant-id"),
) -> tuple[str, str]:
    return x_user_id, x_tenant_id


def _cache_key(tenant_id: str, question: str) -> str:
    digest = hashlib.sha256(question.encode()).hexdigest()
    return f"query:{tenant_id}:{digest}"


def _get_redis():
    import redis
    return redis.from_url(settings.redis_url, decode_responses=True)


@router.post(
    "/query",
    response_model=NlQueryResponse,
    summary="Ask a natural language financial question",
)
async def nl_query(
    body: NlQueryRequest,
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> NlQueryResponse:
    """
    Synchronous endpoint (≤ 10s).
    Cached in Redis by (tenant_id, sha256(question)) with TTL = 60 minutes.
    """
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    user_id, tenant_id = headers
    cache_key = _cache_key(tenant_id, body.question)

    # Try Redis cache first
    try:
        r = _get_redis()
        cached = r.get(cache_key)
        if cached:
            data = json.loads(cached)
            return NlQueryResponse(**data)
    except Exception:
        pass  # Cache miss or Redis unavailable — proceed

    # Persist job for audit trail
    job = AiJob(
        tenant_id=UUID(tenant_id),
        user_id=UUID(user_id),
        job_type="nl_query",
        status="processing",
        input_data={"question": body.question},
        model_used="gpt-4o",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        from app.services.nl_query_service import process_query

        result = await process_query(
            tenant_id=tenant_id,
            question=body.question,
        )

        job.status = "completed"
        job.result = result
        db.commit()

        response = NlQueryResponse(
            answer=result["answer"],
            data=result["data"],
            chart_data=result.get("chart_data"),
            suggested_actions=result.get("suggested_actions", []),
        )

        # Store in Redis cache (TTL = 3600s = 60 min)
        try:
            r = _get_redis()
            r.setex(cache_key, 3600, response.model_dump_json())
        except Exception:
            pass

        return response

    except HTTPException:
        raise
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)[:500]
        db.commit()
        raise HTTPException(status_code=502, detail=f"Query processing failed: {exc}") from exc
