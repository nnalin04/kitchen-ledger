-- Add status and completed_at to stock_transfers

ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
