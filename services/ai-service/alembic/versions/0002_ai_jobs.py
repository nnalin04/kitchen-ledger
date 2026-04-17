"""create ai_jobs table

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
        sa.Column('job_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('input_data', JSONB, nullable=False, server_default='{}'),
        sa.Column('result_data', JSONB, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.CheckConstraint("job_type IN ('ocr', 'voice_query', 'forecast')", name='ck_ai_jobs_job_type'),
        sa.CheckConstraint("status IN ('pending', 'processing', 'completed', 'failed')", name='ck_ai_jobs_status'),
    )

    op.execute("""
        ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON ai_jobs
            USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
    """)

    op.create_index('idx_ai_jobs_tenant_status', 'ai_jobs', ['tenant_id', 'status'])
    op.create_index('idx_ai_jobs_tenant_type', 'ai_jobs', ['tenant_id', 'job_type'])

    op.execute("""
        CREATE OR REPLACE FUNCTION update_ai_jobs_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_ai_jobs_updated_at
            BEFORE UPDATE ON ai_jobs
            FOR EACH ROW EXECUTE FUNCTION update_ai_jobs_updated_at();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_ai_jobs_updated_at ON ai_jobs")
    op.execute("DROP FUNCTION IF EXISTS update_ai_jobs_updated_at")
    op.drop_index('idx_ai_jobs_tenant_type', table_name='ai_jobs')
    op.drop_index('idx_ai_jobs_tenant_status', table_name='ai_jobs')
    op.drop_table('ai_jobs')
