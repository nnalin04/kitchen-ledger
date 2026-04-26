"""create ai_jobs table (full TRD schema)

Revision ID: 0002
Revises: 0001
Create Date: 2025-01-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ai_jobs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=True),
        sa.Column(
            'job_type',
            sa.String(50),
            nullable=False,
        ),
        sa.Column(
            'status',
            sa.String(20),
            nullable=False,
            server_default='pending',
        ),
        sa.Column('input_data', JSONB, nullable=True),
        sa.Column('result', JSONB, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('model_used', sa.String(100), nullable=True),
        sa.Column('tokens_used', sa.Integer, nullable=True),
        sa.Column('processing_ms', sa.Integer, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint(
            "job_type IN ('notebook_ocr','receipt_ocr','voice_transcribe','nl_query','forecast')",
            name='ck_ai_jobs_job_type',
        ),
        sa.CheckConstraint(
            "status IN ('pending','processing','completed','failed')",
            name='ck_ai_jobs_status',
        ),
    )

    # Indexes
    op.create_index(
        'idx_ai_jobs_tenant_created',
        'ai_jobs',
        ['tenant_id', sa.text('created_at DESC')],
    )
    op.create_index(
        'idx_ai_jobs_status_created',
        'ai_jobs',
        ['status', 'created_at'],
        postgresql_where=sa.text("status = 'pending'"),
    )

    # Enable RLS
    op.execute("""
        ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON ai_jobs
            USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
    """)

    # Audit trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION update_ai_jobs_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.completed_at = CASE
                WHEN NEW.status IN ('completed', 'failed') AND OLD.status NOT IN ('completed', 'failed')
                THEN NOW()
                ELSE NEW.completed_at
            END;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_ai_jobs_completed_at
            BEFORE UPDATE ON ai_jobs
            FOR EACH ROW EXECUTE FUNCTION update_ai_jobs_updated_at();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_ai_jobs_completed_at ON ai_jobs")
    op.execute("DROP FUNCTION IF EXISTS update_ai_jobs_updated_at")
    op.drop_index('idx_ai_jobs_status_created', table_name='ai_jobs')
    op.drop_index('idx_ai_jobs_tenant_created', table_name='ai_jobs')
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON ai_jobs")
    op.drop_table('ai_jobs')
