"""
Voice transcription router (AI-4).

Endpoints:
  POST /api/ai/voice/transcribe — transcribe audio + parse structured command
  GET  /api/ai/voice/{job_id}  — poll async voice job (for long audio)
"""
from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.ai_job import AiJob
from app.schemas.ai_job import NotebookOcrJobResponse, VoiceTranscribeResponse

router = APIRouter()

ALLOWED_AUDIO_TYPES = {
    "audio/wav", "audio/wave", "audio/x-wav",
    "audio/mpeg", "audio/mp3",
    "audio/mp4", "audio/m4a", "audio/x-m4a",
    "audio/ogg", "audio/webm",
}
MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25 MB


def _gateway_headers(
    x_user_id: str = Header(..., alias="x-user-id"),
    x_tenant_id: str = Header(..., alias="x-tenant-id"),
) -> tuple[str, str]:
    return x_user_id, x_tenant_id


@router.post(
    "/voice/transcribe",
    response_model=VoiceTranscribeResponse,
    summary="Transcribe an audio command and parse it into structured data",
)
async def transcribe_voice(
    audio: Annotated[UploadFile, File(description="WAV/MP3/M4A/OGG audio, max 25MB")],
    command_type: Annotated[Literal["waste", "stock_count", "receipt"], Form()] = "stock_count",
    language: Annotated[str, Form()] = "en",
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> VoiceTranscribeResponse:
    """
    Synchronous endpoint (< 3s expected).
    Transcribes audio via Whisper then parses with GPT-4o-mini.
    """
    from app.core.config import settings
    from app.services import voice_service
    from app.clients.inventory_client import get_item_names

    if not settings.sarvam_api_key:
        raise HTTPException(status_code=503, detail="Sarvam API key not configured")

    # Validate audio type
    content_type = audio.content_type or ""
    # Some clients send audio/x-wav, audio/wave, etc.
    if content_type not in ALLOWED_AUDIO_TYPES and not content_type.startswith("audio/"):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported audio type {content_type!r}. Must be WAV, MP3, M4A, or OGG.",
        )

    user_id, tenant_id = headers
    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=422, detail="Audio file exceeds 25 MB limit")

    # Persist job for audit trail
    job = AiJob(
        tenant_id=UUID(tenant_id),
        user_id=UUID(user_id),
        job_type="voice_transcribe",
        status="processing",
        input_data={"command_type": command_type, "language": language},
        model_used="sarvam-saarika:v2",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        # 1. Transcribe
        transcript = voice_service.transcribe(audio_bytes, language)

        # 2. Fetch known items for better matching
        known_items: list[str] = []
        try:
            known_items = await get_item_names(tenant_id)
        except Exception:
            pass

        # 3. Parse command
        parsed = voice_service.parse_command(transcript, command_type, known_items)

        # 4. Confidence
        confidence = voice_service.compute_confidence(parsed, command_type)

        job.status = "completed"
        job.result = {"transcript": transcript, "parsed": parsed, "confidence": confidence}
        db.commit()

        return VoiceTranscribeResponse(
            transcript=transcript,
            parsed=parsed,
            confidence=confidence,
        )

    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)[:500]
        db.commit()
        raise HTTPException(status_code=502, detail=f"Voice transcription failed: {exc}") from exc


@router.get(
    "/voice/{job_id}",
    response_model=NotebookOcrJobResponse,
    summary="Poll status of a voice processing job",
)
def get_voice_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> NotebookOcrJobResponse:
    _, tenant_id = headers
    job = (
        db.query(AiJob)
        .filter(AiJob.id == job_id, AiJob.tenant_id == UUID(tenant_id))
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return NotebookOcrJobResponse(
        job_id=job.id,
        status=job.status,
        result=job.result,
        error_message=job.error_message,
    )
