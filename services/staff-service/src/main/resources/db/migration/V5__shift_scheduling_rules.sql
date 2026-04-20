-- V5: Staff scheduling rule additions
-- 1. ends_next_day flag for cross-midnight shifts
-- 2. no_show status in the shifts status CHECK constraint

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS ends_next_day BOOLEAN NOT NULL DEFAULT FALSE;

-- Extend the status CHECK constraint to include no_show
-- (PostgreSQL requires dropping + re-adding named constraints)
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
ALTER TABLE shifts
    ADD CONSTRAINT shifts_status_check
    CHECK (status IN ('scheduled','published','confirmed','swapped','no_show','cancelled'));

-- Index to support no-show detection job querying by status + date
CREATE INDEX IF NOT EXISTS idx_shifts_status_date
    ON shifts (status, shift_date);
