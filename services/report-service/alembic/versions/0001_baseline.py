"""baseline — initial report-service schema

This migration creates the complete initial schema required for the
report-service.  Later migrations apply incremental changes on top.

Revision ID: 0001
Revises:
Create Date: 2026-04-20 00:00:00.000000

Upgrade path for existing environments:
  - Environments already stamped at revision 0001 (no-op baseline):
    Run ``alembic upgrade head`` — subsequent migrations are idempotent
    (IF NOT EXISTS) so they can be applied safely.
  - Fresh DB: run ``alembic upgrade head`` — creates complete schema.
"""
from alembic import op


revision = '0001'
down_revision = None
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

        CREATE POLICY IF NOT EXISTS tenant_isolation ON report_jobs
            USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

        CREATE INDEX IF NOT EXISTS idx_report_jobs_tenant
            ON report_jobs (tenant_id, created_at DESC);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_report_jobs_tenant;
        DROP TABLE IF EXISTS report_jobs;
    """)
