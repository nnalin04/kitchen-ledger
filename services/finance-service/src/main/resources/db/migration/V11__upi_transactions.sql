CREATE TABLE upi_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    report_date     DATE,
    transaction_ref VARCHAR(100) UNIQUE NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    payer_vpa       VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),
    settled_at      TIMESTAMPTZ,
    raw_webhook     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE upi_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY upi_transactions_tenant_isolation ON upi_transactions
    USING (
        COALESCE(current_setting('app.current_tenant_id', TRUE), '') = ''
        OR tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE INDEX idx_upi_transactions_tenant_date ON upi_transactions(tenant_id, report_date);
CREATE INDEX idx_upi_transactions_ref ON upi_transactions(transaction_ref);

GRANT SELECT, INSERT, UPDATE ON upi_transactions TO kl_user;
