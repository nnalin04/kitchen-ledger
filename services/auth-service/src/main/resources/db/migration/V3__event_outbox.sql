CREATE TABLE IF NOT EXISTS event_outbox (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID,
    routing_key TEXT        NOT NULL,
    payload     TEXT        NOT NULL,
    failed_at   TIMESTAMPTZ NOT NULL,
    retry_count INT         NOT NULL DEFAULT 0,
    last_error  TEXT,
    replayed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_event_outbox_pending
    ON event_outbox (failed_at) WHERE replayed_at IS NULL;
