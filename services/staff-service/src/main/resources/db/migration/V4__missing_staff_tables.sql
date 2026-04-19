-- H-8: Add break tracking to attendance + 4 new staff tables
-- Migration order after V3__event_outbox.sql

-- ──────────────────────────────────────────────────────────────────────────
-- Break tracking on attendance
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS break_start     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS break_end       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS break_minutes   INT GENERATED ALWAYS AS (
        CASE
            WHEN break_start IS NOT NULL AND break_end IS NOT NULL
            THEN EXTRACT(EPOCH FROM (break_end - break_start))::INT / 60
            ELSE 0
        END
    ) STORED;

-- ──────────────────────────────────────────────────────────────────────────
-- Time-off requests
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_off_requests (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID         NOT NULL,
    employee_id      UUID         NOT NULL REFERENCES employees(id),
    request_type     VARCHAR(20)  NOT NULL CHECK (request_type IN ('VACATION','SICK','PERSONAL','UNPAID')),
    start_date       DATE         NOT NULL,
    end_date         DATE         NOT NULL,
    reason           TEXT,
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING','APPROVED','DENIED','CANCELLED')),
    reviewed_by      UUID         REFERENCES employees(id),
    reviewed_at      TIMESTAMPTZ,
    review_notes     TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT valid_time_off_date_range CHECK (end_date >= start_date)
);

ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY time_off_tenant_isolation ON time_off_requests
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE INDEX idx_time_off_tenant_employee ON time_off_requests (tenant_id, employee_id)
    WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- Certifications
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certifications (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL,
    employee_id     UUID         NOT NULL REFERENCES employees(id),
    cert_name       VARCHAR(200) NOT NULL,
    cert_number     VARCHAR(100),
    issued_by       VARCHAR(200),
    issued_date     DATE,
    expiry_date     DATE,
    document_url    TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                                 CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY certifications_tenant_isolation ON certifications
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE INDEX idx_certifications_expiry ON certifications (tenant_id, expiry_date)
    WHERE deleted_at IS NULL AND status = 'ACTIVE';

-- ──────────────────────────────────────────────────────────────────────────
-- Training milestones
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_milestones (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL,
    employee_id     UUID         NOT NULL REFERENCES employees(id),
    milestone_name  VARCHAR(200) NOT NULL,
    category        VARCHAR(100) NOT NULL,
    target_date     DATE,
    completed_date  DATE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'NOT_STARTED'
                                 CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE training_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY training_tenant_isolation ON training_milestones
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE INDEX idx_training_tenant_employee ON training_milestones (tenant_id, employee_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Shift swaps
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_swaps (
    id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  UUID        NOT NULL,
    requesting_employee_id     UUID        NOT NULL REFERENCES employees(id),
    target_employee_id         UUID        NOT NULL REFERENCES employees(id),
    original_shift_id          UUID        NOT NULL REFERENCES shifts(id),
    target_shift_id            UUID        REFERENCES shifts(id),  -- NULL = open swap request
    status                     VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                           CHECK (status IN (
                                               'PENDING','ACCEPTED_BY_EMPLOYEE',
                                               'APPROVED','DENIED','CANCELLED'
                                           )),
    request_reason             TEXT,
    reviewed_by                UUID        REFERENCES employees(id),
    reviewed_at                TIMESTAMPTZ,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_swaps_tenant_isolation ON shift_swaps
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE INDEX idx_shift_swaps_tenant ON shift_swaps (tenant_id);
