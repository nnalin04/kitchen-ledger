"""Add completed_at and error_message to report_jobs

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-19 00:00:00.000000

Adds fields required for async job polling:
  - completed_at  — set when a job transitions to completed or failed
  - error_message — human-readable failure reason stored on failed jobs
"""
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE report_jobs
            ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS error_message TEXT;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE report_jobs
            DROP COLUMN IF EXISTS completed_at,
            DROP COLUMN IF EXISTS error_message;
    """)
