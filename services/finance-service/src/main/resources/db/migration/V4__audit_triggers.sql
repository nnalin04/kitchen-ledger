-- =========================================================
-- Flyway migration: V4__audit_triggers.sql  (finance-service)
-- Attaches the shared audit_trigger_fn() (created by auth-service
-- V2 migration) to finance-service entity tables.
-- Requires auth-service V2 to have run first so the function exists.
-- =========================================================

CREATE TRIGGER audit_daily_sales_reports
    AFTER INSERT OR UPDATE OR DELETE ON daily_sales_reports
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_expenses
    AFTER INSERT OR UPDATE OR DELETE ON expenses
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_vendor_payments
    AFTER INSERT OR UPDATE OR DELETE ON vendor_payments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
