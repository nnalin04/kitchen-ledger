-- =============================================================
--  Finance Service Schema  –  V1__finance_schema.sql
--  Tables: accounts, vendors, daily_sales_reports, expenses, vendor_payments
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- Chart of Accounts
-- ──────────────────────────────────────────────────────────────
CREATE TABLE accounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    account_code    VARCHAR(20) NOT NULL,
    account_name    VARCHAR(200) NOT NULL,
    account_type    VARCHAR(30) NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
    parent_id       UUID        REFERENCES accounts(id),
    is_system       BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (tenant_id, account_code)
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON accounts
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_accounts_tenant ON accounts (tenant_id);

-- ──────────────────────────────────────────────────────────────
-- Vendors  (finance-side AP contacts, separate from inventory suppliers)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE vendors (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID        NOT NULL,
    name                VARCHAR(200) NOT NULL,
    contact_name        VARCHAR(200),
    email               VARCHAR(255),
    phone               VARCHAR(30),
    gstin               VARCHAR(15),
    payment_terms_days  INT         NOT NULL DEFAULT 30,
    outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vendors
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_vendors_tenant ON vendors (tenant_id) WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- Daily Sales Reports  (one row per tenant per day)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE daily_sales_reports (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID        NOT NULL,
    report_date              DATE        NOT NULL,
    covers_count             INT         NOT NULL DEFAULT 0,
    gross_sales              NUMERIC(12,2) NOT NULL DEFAULT 0,
    discounts                NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_sales                NUMERIC(12,2) GENERATED ALWAYS AS (gross_sales - discounts) STORED,
    cash_sales               NUMERIC(12,2) NOT NULL DEFAULT 0,
    upi_sales                NUMERIC(12,2) NOT NULL DEFAULT 0,
    card_sales               NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_sales              NUMERIC(12,2) NOT NULL DEFAULT 0,
    vat_collected            NUMERIC(12,2) NOT NULL DEFAULT 0,
    service_charge_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
    cost_of_goods_sold       NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes                    TEXT,
    is_finalized             BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by               UUID        NOT NULL,
    approved_by              UUID,
    finalized_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, report_date)
);

ALTER TABLE daily_sales_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON daily_sales_reports
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_dsr_tenant_date ON daily_sales_reports (tenant_id, report_date DESC);

-- ──────────────────────────────────────────────────────────────
-- Expenses
-- ──────────────────────────────────────────────────────────────
CREATE TABLE expenses (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    expense_date    DATE        NOT NULL,
    category        VARCHAR(50) NOT NULL,
    description     VARCHAR(500) NOT NULL,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    vendor_id       UUID        REFERENCES vendors(id),
    payment_method  VARCHAR(30) NOT NULL DEFAULT 'cash'
                        CHECK (payment_method IN ('cash','upi','card','bank_transfer','cheque')),
    reference_number VARCHAR(100),
    receipt_url     VARCHAR(500),
    is_recurring    BOOLEAN     NOT NULL DEFAULT FALSE,
    account_id      UUID        REFERENCES accounts(id),
    created_by      UUID        NOT NULL,
    approved_by     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON expenses
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_expenses_tenant_date ON expenses (tenant_id, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_tenant_category ON expenses (tenant_id, category) WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- Vendor Payments  (AP ledger)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE vendor_payments (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID        NOT NULL,
    vendor_id        UUID        NOT NULL REFERENCES vendors(id),
    expense_id       UUID        REFERENCES expenses(id),
    payment_date     DATE        NOT NULL,
    amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method   VARCHAR(30) NOT NULL DEFAULT 'cash'
                         CHECK (payment_method IN ('cash','upi','card','bank_transfer','cheque')),
    reference_number VARCHAR(100),
    notes            TEXT,
    created_by       UUID        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vendor_payments
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_vendor_payments_tenant ON vendor_payments (tenant_id, vendor_id);
CREATE INDEX idx_vendor_payments_date ON vendor_payments (tenant_id, payment_date DESC);

-- ──────────────────────────────────────────────────────────────
-- Audit trigger (shared function, finance-service tables)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_dsr_updated_at
    BEFORE UPDATE ON daily_sales_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
