-- Fix CHECK constraints to match Java enum .name() values (uppercase)
-- These constraints were originally created with lowercase values but
-- @Enumerated(EnumType.STRING) serializes using .name() which is uppercase.

-- inventory_counts.count_type: 'full'/'cycle' → 'FULL'/'CYCLE'
DO $$ BEGIN
    ALTER TABLE inventory_counts DROP CONSTRAINT inventory_counts_count_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE inventory_counts
    ADD CONSTRAINT inventory_counts_count_type_check
    CHECK (count_type IN ('FULL', 'CYCLE'));

-- inventory_counts.status: 'in_progress'/'completed'/'verified' → uppercase
DO $$ BEGIN
    ALTER TABLE inventory_counts DROP CONSTRAINT inventory_counts_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE inventory_counts
    ADD CONSTRAINT inventory_counts_status_check
    CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'VERIFIED'));

-- stock_transfers.status: 'pending'/'approved'/... → uppercase (added by V5)
DO $$ BEGIN
    ALTER TABLE stock_transfers DROP CONSTRAINT stock_transfers_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE stock_transfers
    ADD CONSTRAINT stock_transfers_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED'));
