-- ====================================================
-- Migration 001: Notification Service schema
-- ====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    user_id     UUID,           -- NULL = broadcast to all tenant users
    type        VARCHAR(100) NOT NULL,
    priority    VARCHAR(20) NOT NULL DEFAULT 'informational'
                CHECK (priority IN ('critical','important','informational')),
    title       VARCHAR(255) NOT NULL,
    body        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    channels    JSONB NOT NULL DEFAULT '[]',
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant
    ON notifications(tenant_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON notifications
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE TABLE IF NOT EXISTS device_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    tenant_id    UUID NOT NULL,
    token        VARCHAR(500) NOT NULL UNIQUE,
    platform     VARCHAR(20) NOT NULL CHECK (platform IN ('ios','android','web')),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user
    ON device_tokens(user_id) WHERE is_active = TRUE;

-- Migrations tracking table (lightweight — no external tool)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(50) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
