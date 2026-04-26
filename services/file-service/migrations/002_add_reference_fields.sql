-- Add reference tracking and public URL to file_uploads
ALTER TABLE file_uploads
    ADD COLUMN IF NOT EXISTS reference_id   UUID,
    ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS public_url     VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_file_uploads_reference
    ON file_uploads (reference_id)
    WHERE reference_id IS NOT NULL;
