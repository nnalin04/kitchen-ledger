-- Add due_date and payment_status to expenses to support scheduled due-date alerts
-- and overdue marking (FinanceScheduledJobs).
ALTER TABLE expenses
    ADD COLUMN due_date      DATE,
    ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'overdue'));

-- Back-fill existing rows: expenses with no due date are treated as already paid.
UPDATE expenses
SET payment_status = 'paid'
WHERE deleted_at IS NULL;

CREATE INDEX idx_expenses_payment_status_due ON expenses (payment_status, due_date)
    WHERE payment_status IN ('pending', 'overdue') AND deleted_at IS NULL;
