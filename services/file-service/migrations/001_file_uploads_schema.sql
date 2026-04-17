-- =============================================================
--  File Service Schema  –  001_file_uploads_schema.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS file_uploads (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID         NOT NULL,
    original_name    VARCHAR(500) NOT NULL,
    storage_path     VARCHAR(1000) NOT NULL,
    mime_type        VARCHAR(200) NOT NULL,
    file_size        BIGINT       NOT NULL,
    purpose          VARCHAR(100) NOT NULL DEFAULT 'general',
    uploaded_by      UUID         NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON file_uploads
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE INDEX idx_file_uploads_tenant    ON file_uploads (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_file_uploads_purpose   ON file_uploads (tenant_id, purpose) WHERE deleted_at IS NULL;
CREATE INDEX idx_file_uploads_uploaded_by ON file_uploads (uploaded_by) WHERE deleted_at IS NULL;
