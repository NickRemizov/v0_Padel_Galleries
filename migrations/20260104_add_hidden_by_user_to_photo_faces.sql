-- Migration: Add hidden_by_user to photo_faces table
-- Date: 2026-01-04
-- Purpose: Allow users to hide their own photos from public galleries

-- Add hidden_by_user column (default false)
ALTER TABLE photo_faces
ADD COLUMN IF NOT EXISTS hidden_by_user BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for filtering visible photos
CREATE INDEX IF NOT EXISTS idx_photo_faces_hidden ON photo_faces(hidden_by_user) WHERE hidden_by_user = TRUE;
