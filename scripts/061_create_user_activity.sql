-- Migration: Create user_activity table for tracking user actions
-- Date: 2026-01-05

CREATE TABLE IF NOT EXISTS user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,  -- 'photo_hidden', 'photo_unhidden', 'photo_verified', 'photo_rejected'
  image_id UUID REFERENCES gallery_images(id) ON DELETE CASCADE,
  gallery_id UUID REFERENCES galleries(id) ON DELETE SET NULL,
  metadata JSONB,  -- {filename: "...", gallery_title: "..."}
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queries by person and date
CREATE INDEX IF NOT EXISTS idx_user_activity_person_date ON user_activity(person_id, created_at DESC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at);
