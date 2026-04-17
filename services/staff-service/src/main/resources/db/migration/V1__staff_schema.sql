-- =============================================================
--  Staff Service Schema  –  V1__staff_schema.sql
--  Tables: employees, shifts, attendance, tasks, task_completions, tip_pools
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- Employees
-- ──────────────────────────────────────────────────────────────
CREATE TABLE employees (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID         NOT NULL,
    user_id                  UUID,                        -- links to auth.users (optional)
    first_name               VARCHAR(100) NOT NULL,
    last_name                VARCHAR(100) NOT NULL,
    role                     VARCHAR(50)  NOT NULL,
    employment_type          VARCHAR(20)  NOT NULL DEFAULT 'full_time'
                                 CHECK (employment_type IN ('full_time','part_time','contractor')),
    hire_date                DATE         NOT NULL,
    end_date                 DATE,
    hourly_rate              NUMERIC(8,2),
    monthly_salary           NUMERIC(10,2),
    phone                    VARCHAR(30),
    emergency_contact_name   VARCHAR(200),
    emergency_contact_phone  VARCHAR(30),
    notes                    TEXT,
    is_active                BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employees
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_employees_tenant ON employees (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_user   ON employees (tenant_id, user_id) WHERE user_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- Shifts
-- ──────────────────────────────────────────────────────────────
CREATE TABLE shifts (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID        NOT NULL,
    employee_id  UUID        NOT NULL REFERENCES employees(id),
    shift_date   DATE        NOT NULL,
    start_time   TIME        NOT NULL,
    end_time     TIME        NOT NULL,
    role_label   VARCHAR(100),
    station      VARCHAR(100),
    status       VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled','confirmed','swapped','cancelled')),
    notes        TEXT,
    created_by   UUID        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shifts
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_shifts_tenant_date ON shifts (tenant_id, shift_date);
CREATE INDEX idx_shifts_employee    ON shifts (employee_id, shift_date);

-- ──────────────────────────────────────────────────────────────
-- Attendance (clock-in / clock-out)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE attendance (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        NOT NULL,
    employee_id   UUID        NOT NULL REFERENCES employees(id),
    shift_id      UUID        REFERENCES shifts(id),
    clock_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clock_out_at  TIMESTAMPTZ,
    hours_worked  NUMERIC(5,2),
    late_minutes  INT         NOT NULL DEFAULT 0,
    notes         TEXT,
    recorded_by   UUID        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendance
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_attendance_tenant_date ON attendance (tenant_id, clock_in_at DESC);
CREATE INDEX idx_attendance_employee    ON attendance (employee_id, clock_in_at DESC);

-- ──────────────────────────────────────────────────────────────
-- Tasks
-- ──────────────────────────────────────────────────────────────
CREATE TABLE tasks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID        NOT NULL,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    assigned_to  UUID        REFERENCES employees(id),
    due_date     DATE,
    priority     VARCHAR(10) NOT NULL DEFAULT 'medium'
                     CHECK (priority IN ('low','medium','high')),
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','in_progress','completed','cancelled')),
    is_recurring BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by   UUID        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tasks
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_tasks_tenant_status ON tasks (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assigned_to   ON tasks (assigned_to) WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- Task Completions
-- ──────────────────────────────────────────────────────────────
CREATE TABLE task_completions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID        NOT NULL REFERENCES tasks(id),
    tenant_id    UUID        NOT NULL,
    completed_by UUID        NOT NULL REFERENCES employees(id),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes        TEXT,
    photo_url    VARCHAR(500)
);

ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON task_completions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_task_completions_task ON task_completions (task_id);

-- ──────────────────────────────────────────────────────────────
-- Tip Pools
-- ──────────────────────────────────────────────────────────────
CREATE TABLE tip_pools (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID        NOT NULL,
    pool_date           DATE        NOT NULL,
    total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
    distribution_method VARCHAR(20) NOT NULL DEFAULT 'equal'
                            CHECK (distribution_method IN ('equal','points_based')),
    is_distributed      BOOLEAN     NOT NULL DEFAULT FALSE,
    distributed_at      TIMESTAMPTZ,
    notes               TEXT,
    created_by          UUID        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, pool_date)
);

ALTER TABLE tip_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tip_pools
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_tip_pools_tenant_date ON tip_pools (tenant_id, pool_date DESC);

-- ──────────────────────────────────────────────────────────────
-- Audit triggers
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_shifts_updated_at
    BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
