-- =========================================================
-- Flyway migration: V10__event_outbox_rls.sql  (inventory-service)
-- Enables Row-Level Security on event_outbox.
-- Fixes NH-5: event_outbox stored sensitive payloads with
-- no tenant isolation at the DB layer.
--
-- Policy allows:
--   1. Tenant-scoped requests (app.current_tenant_id is set)
--      see only their own rows.
--   2. Background jobs (no tenant context set) see all rows
--      so OutboxReplayJob can process events across tenants.
-- =========================================================

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_outbox_tenant_isolation ON event_outbox
    USING (
        COALESCE(current_setting('app.current_tenant_id', TRUE), '') = ''
        OR tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

GRANT SELECT, INSERT, UPDATE ON event_outbox TO kl_user;
