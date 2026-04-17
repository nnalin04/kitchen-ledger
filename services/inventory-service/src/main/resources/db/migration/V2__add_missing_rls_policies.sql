-- =========================================================
-- Flyway migration: V2__add_missing_rls_policies.sql
-- Adds RLS policies to 6 child tables that were missing
-- tenant isolation in V1.  The parent tables already have
-- tenant_id columns and policies; child tables inherit
-- isolation by joining back to their parent.
-- =========================================================

-- purchase_order_items — no tenant_id column; isolate via parent PO
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_items_tenant_isolation ON purchase_order_items
    USING (
        purchase_order_id IN (
            SELECT id FROM purchase_orders
            WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        )
    );

-- stock_receipt_items — no tenant_id column; isolate via parent receipt
ALTER TABLE stock_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_receipt_items_tenant_isolation ON stock_receipt_items
    USING (
        stock_receipt_id IN (
            SELECT id FROM stock_receipts
            WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        )
    );

-- stock_transfers — has tenant_id column; enable RLS and add direct policy
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_transfers_tenant_isolation ON stock_transfers
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- stock_transfer_items — no tenant_id column; isolate via parent transfer
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_transfer_items_tenant_isolation ON stock_transfer_items
    USING (
        stock_transfer_id IN (
            SELECT id FROM stock_transfers
            WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        )
    );

-- recipe_ingredients — no tenant_id column; isolate via parent recipe
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipe_ingredients_tenant_isolation ON recipe_ingredients
    USING (
        recipe_id IN (
            SELECT id FROM recipes
            WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        )
    );

-- inventory_count_items — no tenant_id column; isolate via parent count
ALTER TABLE inventory_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_count_items_tenant_isolation ON inventory_count_items
    USING (
        inventory_count_id IN (
            SELECT id FROM inventory_counts
            WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        )
    );

-- Grant DML privileges to the application role on all child tables
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_order_items  TO kl_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_receipt_items   TO kl_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_transfer_items  TO kl_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_transfers       TO kl_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON recipe_ingredients    TO kl_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_count_items TO kl_user;
