from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery = Celery(
    "report_service",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "cleanup-stuck-report-jobs": {
            "task": "report_service.cleanup_stuck_jobs",
            "schedule": crontab(minute="*/15"),
        },
    },
)
