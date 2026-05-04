-- Usage Variance (Actual vs Theoretical) log
CREATE TABLE IF NOT EXISTS usage_variance_logs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL,
    recipe_id             UUID REFERENCES recipes(id),
    service_date          DATE NOT NULL,
    portions_served       INT NOT NULL,
    ingredient_variances  JSONB NOT NULL DEFAULT '[]',
    overall_status        VARCHAR(20) NOT NULL CHECK (overall_status IN ('ACCEPTABLE','ALERT','CRITICAL')),
    logged_by             UUID NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_variance_tenant_date ON usage_variance_logs(tenant_id, service_date DESC);

ALTER TABLE usage_variance_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'usage_variance_logs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON usage_variance_logs
        USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
  END IF;
END $$;
