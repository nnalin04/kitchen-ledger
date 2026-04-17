-- Add optimistic-locking version columns to frequently-updated tables.
-- JPA @Version increments this on every UPDATE; a concurrent write to the
-- same row triggers OptimisticLockException before the stale write can land.

ALTER TABLE accounts
    ADD COLUMN version INT NOT NULL DEFAULT 0;

ALTER TABLE daily_sales_reports
    ADD COLUMN version INT NOT NULL DEFAULT 0;
