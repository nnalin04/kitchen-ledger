"""
Celery tasks for async voice processing (if needed for longer audio files).
Short voice commands (< 3s) are handled synchronously in the router.
"""
from __future__ import annotations

import asyncio
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="voice_tasks.process_long_audio",
    bind=True,
    max_retries=2,
    acks_late=True,
)
def process_long_audio(self, job_id: str, file_url: str, tenant_id: str,
                        command_type: str = "stock_count", language: str = "en"):
    """Process a long audio file asynchronously (e.g. > 25MB split into chunks)."""
    import httpx
    from app.core.database import SessionLocal
    from app.models.ai_job import AiJob
    from app.services.voice_service import transcribe, parse_command

    logger.info("voice long_audio started: job_id=%s", job_id)
    db = SessionLocal()
    try:
        job = db.query(AiJob).filter(AiJob.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")
        job.status = "processing"
        db.commit()

        with httpx.Client(timeout=60) as client:
            resp = client.get(file_url)
            resp.raise_for_status()
            audio_bytes = resp.content

        transcript = transcribe(audio_bytes, language)
        parsed = parse_command(transcript, command_type)

        from app.services.voice_service import compute_confidence
        confidence = compute_confidence(parsed, command_type)

        job.status = "completed"
        job.result = {
            "transcript": transcript,
            "parsed": parsed,
            "confidence": confidence,
        }
        db.commit()
        logger.info("voice long_audio completed: job_id=%s", job_id)

    except Exception as exc:
        logger.exception("voice long_audio failed: job_id=%s", job_id)
        db.rollback()
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30)
        try:
            job = db.query(AiJob).filter(AiJob.id == job_id).first()
            if job:
                job.status = "failed"
                job.error_message = str(exc)[:500]
                db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()
