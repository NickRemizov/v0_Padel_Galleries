-- Migration: Add privacy settings fields to people table
-- Date: 2026-01-04
--
-- Existing fields (NOT adding):
--   gmail, facebook_profile_url, instagram_profile_url, paddle_ranking,
--   show_in_players_gallery, show_photos_in_galleries

-- Privacy and display settings (NEW)
ALTER TABLE people ADD COLUMN IF NOT EXISTS create_personal_gallery BOOLEAN DEFAULT false;
ALTER TABLE people ADD COLUMN IF NOT EXISTS show_name_on_photos BOOLEAN DEFAULT true;
ALTER TABLE people ADD COLUMN IF NOT EXISTS show_telegram_nickname BOOLEAN DEFAULT true;
ALTER TABLE people ADD COLUMN IF NOT EXISTS show_social_links BOOLEAN DEFAULT true;

COMMENT ON COLUMN people.create_personal_gallery IS 'Create personal gallery page for this person';
COMMENT ON COLUMN people.show_name_on_photos IS 'Show person name label on photos';
COMMENT ON COLUMN people.show_telegram_nickname IS 'Show Telegram nickname publicly';
COMMENT ON COLUMN people.show_social_links IS 'Show social media links on profile';
