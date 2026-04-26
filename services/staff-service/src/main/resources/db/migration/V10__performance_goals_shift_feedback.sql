-- performance_goals
CREATE TABLE IF NOT EXISTS performance_goals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    employee_id     UUID        NOT NULL REFERENCES employees(id),
    metric          VARCHAR(100) NOT NULL,
    target_value    NUMERIC(12,2) NOT NULL,
    current_value   NUMERIC(12,2) NOT NULL DEFAULT 0,
    period_start    DATE        NOT NULL,
    period_end      DATE        NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','achieved','missed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

ALTER TABLE performance_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY performance_goals_tenant_isolation ON performance_goals
    USING (
        COALESCE(current_setting('app.current_tenant_id', TRUE), '') = ''
        OR tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE INDEX idx_performance_goals_employee ON performance_goals(tenant_id, employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_performance_goals_status   ON performance_goals(tenant_id, status)      WHERE deleted_at IS NULL;

-- shift_feedback
CREATE TABLE IF NOT EXISTS shift_feedback (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    shift_id        UUID        NOT NULL REFERENCES shifts(id),
    employee_id     UUID        NOT NULL REFERENCES employees(id),
    rating          SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    issues          JSONB       NOT NULL DEFAULT '[]',
    equipment_flags JSONB       NOT NULL DEFAULT '[]',
    morale_note     TEXT,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shift_id, employee_id)
);

ALTER TABLE shift_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_feedback_tenant_isolation ON shift_feedback
    USING (
        COALESCE(current_setting('app.current_tenant_id', TRUE), '') = ''
        OR tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE INDEX idx_shift_feedback_tenant_shift ON shift_feedback(tenant_id, shift_id);
CREATE INDEX idx_shift_feedback_submitted    ON shift_feedback(tenant_id, submitted_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON performance_goals TO kl_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON shift_feedback TO kl_user;
