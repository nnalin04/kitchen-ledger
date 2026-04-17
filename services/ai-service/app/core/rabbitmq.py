"""
Lightweight RabbitMQ publisher for the AI service.
Uses a simple pika blocking connection; wraps each publish in its own connection
to avoid thread-safety issues from Celery workers.
"""
from __future__ import annotations
import json
import uuid
import logging
from datetime import datetime, timezone

import pika

from app.core.config import settings

logger = logging.getLogger(__name__)

EXCHANGE = "kitchenledger.events"


def _build_envelope(event_type: str, tenant_id: str, payload: dict) -> dict:
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "tenant_id": tenant_id,
        "produced_by": "ai-service",
        "produced_at": datetime.now(timezone.utc).isoformat(),
        "version": "1.0",
        "payload": payload,
    }


def publish_event(event_type: str, tenant_id: str, payload: dict) -> None:
    """Publish a domain event to the topic exchange. Best-effort — logs on failure."""
    try:
        params = pika.URLParameters(settings.rabbitmq_url)
        conn = pika.BlockingConnection(params)
        channel = conn.channel()
        channel.exchange_declare(
            exchange=EXCHANGE, exchange_type="topic", durable=True
        )
        envelope = _build_envelope(event_type, tenant_id, payload)
        channel.basic_publish(
            exchange=EXCHANGE,
            routing_key=event_type,
            body=json.dumps(envelope),
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=2,  # persistent
            ),
        )
        conn.close()
        logger.info("Published event %s for tenant %s", event_type, tenant_id)
    except Exception as exc:
        logger.error("Failed to publish event %s: %s", event_type, exc)
