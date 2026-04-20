-- V6: Add deleted_at for soft-delete on shifts (NH-2)
-- Prevents hard delete from breaking attendance FK references to shifts.
ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
