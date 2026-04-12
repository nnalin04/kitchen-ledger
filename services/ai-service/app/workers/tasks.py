from app.workers.celery_app import celery_app
import logging

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.process_ocr", bind=True, max_retries=3)
def process_ocr(self, job_id: str, file_url: str, tenant_id: str):
    """Process OCR on a receipt/invoice image. Stub — Phase 2 implementation."""
    logger.info(f"Processing OCR for job_id={job_id}, tenant={tenant_id}")
    # Phase 2: call Mindee/Google Vision, update ai_jobs, publish ai.ocr.completed
    raise NotImplementedError("OCR task implementation pending — Phase 2")
