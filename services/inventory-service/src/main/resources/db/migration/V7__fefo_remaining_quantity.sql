-- V7: FEFO support — add remaining_quantity to stock_receipt_items (HIGH-03)
-- Initialises to received_quantity for all existing rows (full batch available).
-- Decremented by FefoAllocationService as stock is consumed.

ALTER TABLE stock_receipt_items
    ADD COLUMN IF NOT EXISTS remaining_quantity NUMERIC(12,4) NOT NULL
    DEFAULT 0;

-- Backfill: existing batches start fully available
UPDATE stock_receipt_items
   SET remaining_quantity = received_quantity
 WHERE remaining_quantity = 0;

-- Index: FEFO query filters on tenant, item, confirmed, and remaining > 0
CREATE INDEX IF NOT EXISTS idx_sri_fefo
    ON stock_receipt_items (inventory_item_id, expiry_date ASC NULLS LAST)
    WHERE remaining_quantity > 0;
