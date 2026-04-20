-- V8: DSR PRD field parity (HIGH-05)
-- Adds gift card, digital wallet, comps, voids, tips, and manager auth to daily_sales_reports.

ALTER TABLE daily_sales_reports
    ADD COLUMN IF NOT EXISTS gift_card_sales        NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS wallet_sales           NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS comps_total            NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS voids_total            NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tips_collected         NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS manager_auth_id        UUID;
