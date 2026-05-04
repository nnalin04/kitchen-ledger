-- Add photo verification requirement to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requires_photo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category VARCHAR(30)
    CHECK (category IS NULL OR category IN ('opening','closing','sidework','prep','safety','general'));
