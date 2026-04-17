-- =========================================================
-- Flyway migration: V3__audit_triggers.sql  (inventory-service)
-- Attaches the shared audit_trigger_fn() (created by auth-service
-- V2 migration) to inventory-service entity tables.
-- Requires auth-service V2 to have run first so the function exists.
-- =========================================================

CREATE TRIGGER audit_inventory_items
    AFTER INSERT OR UPDATE OR DELETE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_purchase_orders
    AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_stock_receipts
    AFTER INSERT OR UPDATE OR DELETE ON stock_receipts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_waste_logs
    AFTER INSERT OR UPDATE OR DELETE ON waste_logs
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_recipes
    AFTER INSERT OR UPDATE OR DELETE ON recipes
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
