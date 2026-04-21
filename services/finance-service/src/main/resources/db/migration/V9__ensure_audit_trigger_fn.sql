-- =========================================================
-- Flyway migration: V9__ensure_audit_trigger_fn.sql  (finance-service)
-- Makes this service's migration stack self-sufficient by
-- ensuring audit_trigger_fn() exists before any trigger
-- references it.  Uses CREATE OR REPLACE so it is a no-op
-- when auth-service has already defined the function.
-- Fixes NH-1: cross-service migration ordering race.
-- =========================================================

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
