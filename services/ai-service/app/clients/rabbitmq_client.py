"""
Async RabbitMQ client using aio-pika.
Used by async FastAPI routes; Celery workers use the synchronous pika client
in app/core/rabbitmq.py instead.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import aio_pika

from app.core.config import settings

logger = logging.getLogger(__name__)

EXCHANGE = "kitchenledger.events"


def _build_envelope(
    routing_key: str,
    tenant_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": routing_key,
        "tenant_id": tenant_id,
        "produced_by": "ai-service",
        "produced_at": datetime.now(timezone.utc).isoformat(),
        "version": "1.0",
        "payload": payload,
    }


async def publish(
    routing_key: str,
    tenant_id: str,
    payload: dict[str, Any],
) -> None:
    """Publish a domain event to the kitchenledger.events topic exchange.

    Best-effort: logs on failure rather than raising, so callers are not
    disrupted by transient RabbitMQ issues.
    """
    try:
        connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        async with connection:
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                EXCHANGE,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
            envelope = _build_envelope(routing_key, tenant_id, payload)
            message = aio_pika.Message(
                body=json.dumps(envelope).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            )
            await exchange.publish(message, routing_key=routing_key)
            logger.info("Published async event %s for tenant %s", routing_key, tenant_id)
    except Exception as exc:
        logger.error("Failed to publish async event %s: %s", routing_key, exc)
