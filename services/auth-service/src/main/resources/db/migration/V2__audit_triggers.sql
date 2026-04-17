-- =========================================================
-- Flyway migration: V2__audit_triggers.sql  (auth-service)
-- Creates the shared audit_logs table and the trigger
-- function used by all services.  Also attaches triggers
-- to the auth-service entity tables (users, tenants).
--
-- NOTE: audit_trigger_fn() is defined here first.
-- Other services (inventory, finance, staff) reference it in
-- their own migrations.  auth-service migration MUST run
-- before those services' audit-trigger migrations.
-- =========================================================

-- Shared audit log table (all services write here)
CREATE TABLE IF NOT EXISTS audit_logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID,
    user_id      UUID,
    event_type   TEXT        NOT NULL,   -- INSERT | UPDATE | DELETE
    table_name   TEXT        NOT NULL,
    record_id    UUID        NOT NULL,
    old_data     JSONB,
    new_data     JSONB,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address   TEXT,
    session_user TEXT        DEFAULT current_user
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time
    ON audit_logs (tenant_id, changed_at DESC);

-- Shared trigger function — reads session variables set by TenantRlsAspect
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id   UUID;
BEGIN
    BEGIN
        v_tenant_id := current_setting('app.current_tenant_id', TRUE)::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_tenant_id := NULL;
    END;

    BEGIN
        v_user_id := current_setting('app.current_user_id', TRUE)::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    INSERT INTO audit_logs (
        tenant_id, user_id, event_type, table_name, record_id, old_data, new_data
    ) VALUES (
        v_tenant_id,
        v_user_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'DELETE'              THEN row_to_json(OLD)::JSONB ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE')  THEN row_to_json(NEW)::JSONB ELSE NULL END
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to auth-service entity tables
CREATE TRIGGER audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_tenants
    AFTER INSERT OR UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
