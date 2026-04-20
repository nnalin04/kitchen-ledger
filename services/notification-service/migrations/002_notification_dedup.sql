-- Migration 002: idempotency guard for fan-out push notifications
-- Prevents duplicate sends when RabbitMQ redelivers the same event.

CREATE TABLE IF NOT EXISTS notification_dedup (
    event_id  VARCHAR(255) NOT NULL,
    user_id   UUID         NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);

-- Auto-expire dedup entries after 7 days (keeps table small; redeliveries beyond
-- 7 days are unlikely and would only produce a harmless duplicate notification).
CREATE INDEX IF NOT EXISTS idx_notification_dedup_processed
    ON notification_dedup(processed_at);
