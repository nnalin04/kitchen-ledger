-- M-5: Give the inline UNIQUE constraint a stable name so the service can
-- detect duplicate-DSR violations by constraint name in DataIntegrityViolationException.
-- The constraint was created inline in V1 and received the auto-name
-- daily_sales_reports_tenant_id_report_date_key by PostgreSQL.

ALTER TABLE daily_sales_reports
    DROP CONSTRAINT IF EXISTS daily_sales_reports_tenant_id_report_date_key,
    DROP CONSTRAINT IF EXISTS uq_dsr_tenant_date;

ALTER TABLE daily_sales_reports
    ADD CONSTRAINT uq_dsr_tenant_date UNIQUE (tenant_id, report_date);
