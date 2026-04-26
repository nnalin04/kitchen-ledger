"""
RabbitMQ consumer for the finance.dsr.reconciled event.

When Finance Service marks a daily sales report as reconciled, this consumer
automatically queues a P&L report job for that day so operators always have an
up-to-date PDF available without manual intervention.

Usage: started as a background thread from app/main.py lifespan.
"""
from __future__ import annotations
import json
import logging
import threading
import uuid

import pika
import psycopg2

from app.core.config import settings
from app.core.rabbitmq import EXCHANGE

logger = logging.getLogger(__name__)

_QUEUE = "report-service.dsr_reconciled"
_ROUTING_KEY = "finance.dsr.reconciled"


def _handle_message(ch, method, properties, body: bytes) -> None:
    """Process a single finance.dsr.reconciled event."""
    try:
        envelope = json.loads(body)
        tenant_id: str = envelope.get("tenant_id", "")
        payload: dict = envelope.get("payload", {})
        report_date: str = (
            payload.get("report_date")
            or payload.get("reportDate")
            or payload.get("date", "")
        )

        if not tenant_id or not report_date:
            logger.warning("dsr_reconciled: missing tenant_id or report_date in %s", envelope)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        job_id = str(uuid.uuid4())
        params = {"from": report_date, "to": report_date}

        # Insert report_jobs row synchronously (Celery tasks.py uses psycopg2 too)
        with psycopg2.connect(settings.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO report_jobs
                        (id, tenant_id, report_type, status, params, created_by)
                    VALUES (%s, %s, 'pnl', 'pending', %s::jsonb, 'system')
                    """,
                    (job_id, tenant_id, json.dumps(params)),
                )
            conn.commit()

        # Dispatch Celery task
        from app.workers.tasks import generate_report  # late import avoids circular deps
        generate_report.delay(job_id, "pnl", params, tenant_id)

        logger.info(
            "dsr_reconciled: queued pnl job=%s tenant=%s date=%s",
            job_id, tenant_id, report_date,
        )
        ch.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as exc:
        logger.error("dsr_reconciled: error processing message: %s", exc, exc_info=True)
        # Nack without requeue to avoid poison-pill loops; message goes to dead-letter if configured
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def _run_consumer() -> None:
    """Blocking consumer loop — runs in a daemon thread."""
    try:
        params = pika.URLParameters(settings.rabbitmq_url)
        conn = pika.BlockingConnection(params)
        channel = conn.channel()

        channel.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)
        channel.queue_declare(queue=_QUEUE, durable=True)
        channel.queue_bind(queue=_QUEUE, exchange=EXCHANGE, routing_key=_ROUTING_KEY)
        channel.basic_qos(prefetch_count=1)
        channel.basic_consume(queue=_QUEUE, on_message_callback=_handle_message)

        logger.info("dsr_reconciled consumer: listening on queue=%s", _QUEUE)
        channel.start_consuming()
    except Exception as exc:
        logger.error("dsr_reconciled consumer: exiting due to error: %s", exc, exc_info=True)


def start_consumer_thread() -> threading.Thread:
    """Start the consumer in a daemon thread and return it."""
    t = threading.Thread(target=_run_consumer, daemon=True, name="dsr-reconciled-consumer")
    t.start()
    return t
