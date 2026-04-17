"""report_jobs table

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-15 00:00:00.000000

"""
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS report_jobs (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID NOT NULL,
            report_type VARCHAR(50) NOT NULL,
            status      VARCHAR(20) NOT NULL DEFAULT 'pending',
            params      JSONB NOT NULL DEFAULT '{}',
            output_url  VARCHAR(1000),
            created_by  UUID NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;

        CREATE POLICY tenant_isolation ON report_jobs
            USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

        CREATE INDEX idx_report_jobs_tenant
            ON report_jobs (tenant_id, created_at DESC);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_report_jobs_tenant;
        DROP TABLE IF EXISTS report_jobs;
    """)
