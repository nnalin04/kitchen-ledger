-- V7: per-employee tip distribution records (NH-3)
CREATE TABLE IF NOT EXISTS tip_pool_distributions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    tip_pool_id     UUID        NOT NULL REFERENCES tip_pools(id),
    employee_id     UUID        NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    distributed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpd_pool ON tip_pool_distributions (tip_pool_id);
CREATE INDEX IF NOT EXISTS idx_tpd_employee ON tip_pool_distributions (employee_id, distributed_at DESC);

ALTER TABLE tip_pool_distributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON tip_pool_distributions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
