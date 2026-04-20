-- V8: Add optimistic locking version column to stock_receipts (NH-4)
-- Prevents TOCTOU race in StockReceiptService.confirm().
ALTER TABLE stock_receipts
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
