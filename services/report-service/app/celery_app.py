from celery import Celery
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
)
