from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "ai-service",
    broker=settings.redis_url,            # redis://redis:6379/0
    backend=settings.redis_result_url,    # redis://redis:6379/1
    include=[
        "app.workers.tasks",
        "app.workers.ocr_tasks",
        "app.workers.voice_tasks",
        "app.workers.forecast_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "cleanup-stuck-jobs": {
            "task": "tasks.cleanup_stuck_jobs",
            "schedule": crontab(minute="*/15"),
        },
    },
)
