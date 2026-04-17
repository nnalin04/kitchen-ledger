-- =========================================================
-- Flyway migration: V2__audit_triggers.sql  (staff-service)
-- Attaches the shared audit_trigger_fn() (created by auth-service
-- V2 migration) to staff-service entity tables.
-- Requires auth-service V2 to have run first so the function exists.
-- =========================================================

CREATE TRIGGER audit_employees
    AFTER INSERT OR UPDATE OR DELETE ON employees
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_shifts
    AFTER INSERT OR UPDATE OR DELETE ON shifts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_attendance
    AFTER INSERT OR UPDATE OR DELETE ON attendance
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_tip_pools
    AFTER INSERT OR UPDATE OR DELETE ON tip_pools
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
