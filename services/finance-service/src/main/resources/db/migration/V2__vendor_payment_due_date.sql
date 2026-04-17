-- Add due_date and payment_status to vendor_payments to enable overdue payment tracking.
-- Existing records were payments already made, so back-fill status as 'paid' and
-- due_date as payment_date (i.e., already settled by the recorded payment date).

ALTER TABLE vendor_payments
    ADD COLUMN due_date      DATE,
    ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'paid';

-- Back-fill: all existing records represent completed payments
UPDATE vendor_payments
SET due_date = payment_date,
    payment_status = 'paid';

-- Future "pending" records will have due_date set at creation, status = 'pending'.
-- OverduePaymentJob will transition pending → overdue when due_date < NOW().

CREATE INDEX idx_vendor_payments_overdue
    ON vendor_payments (payment_status, due_date)
    WHERE payment_status IN ('pending', 'overdue');
