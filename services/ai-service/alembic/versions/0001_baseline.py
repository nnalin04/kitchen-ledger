"""baseline

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ai_jobs table created in Phase 2 (Service implementation)
    pass


def downgrade() -> None:
    pass
