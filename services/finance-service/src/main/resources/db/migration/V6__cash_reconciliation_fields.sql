-- H-6: Add cash reconciliation fields to daily_sales_reports
-- cash_count_actual : physical cash counted by manager at close of day
-- cash_over_short   : variance = cash_count_actual - cash_sales (positive = over, negative = short)
-- requires_investigation : flagged when |variance| exceeds the configured threshold

ALTER TABLE daily_sales_reports
    ADD COLUMN IF NOT EXISTS cash_count_actual   NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS cash_over_short      NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS requires_investigation BOOLEAN NOT NULL DEFAULT FALSE;
