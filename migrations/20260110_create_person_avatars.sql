-- Migration: Create person_avatars table
-- Date: 2026-01-10
-- Description: Separate table for person avatars with background removed
-- Supports one-to-many relationship for future multiple avatars per person

-- ============================================
-- Create person_avatars table
-- ============================================

CREATE TABLE IF NOT EXISTS person_avatars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,

    -- Avatar file info
    avatar_url TEXT NOT NULL,                    -- MinIO URL with transparent PNG
    object_name TEXT NOT NULL,                   -- MinIO object name for deletion

    -- Source information
    source_photo_id UUID REFERENCES gallery_images(id) ON DELETE SET NULL,
    source_face_id UUID REFERENCES photo_faces(id) ON DELETE SET NULL,

    -- Status
    is_primary BOOLEAN DEFAULT TRUE,             -- Which avatar is currently active

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure only one primary avatar per person
    CONSTRAINT unique_primary_avatar EXCLUDE USING btree (person_id WITH =) WHERE (is_primary = true)
);

-- Index for person lookup
CREATE INDEX IF NOT EXISTS idx_person_avatars_person_id ON person_avatars(person_id);

-- Index for primary avatar lookup
CREATE INDEX IF NOT EXISTS idx_person_avatars_primary ON person_avatars(person_id, is_primary) WHERE is_primary = true;

-- ============================================
-- Verification queries (run manually after migration)
-- ============================================

-- Check table was created:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'person_avatars'
-- ORDER BY ordinal_position;
