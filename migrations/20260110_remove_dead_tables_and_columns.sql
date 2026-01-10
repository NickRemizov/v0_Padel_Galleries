-- Migration: Remove dead tables and columns
-- Date: 2026-01-10
-- Description: Cleanup of unused database objects identified during dead code audit

-- ============================================
-- PHASE 1: Remove unused columns from photo_faces
-- ============================================

-- These columns were only written to but never read
-- training_used: boolean flag, never queried
-- training_context: jsonb metadata, never queried

ALTER TABLE photo_faces
DROP COLUMN IF EXISTS training_used,
DROP COLUMN IF EXISTS training_context;

-- ============================================
-- PHASE 2: Drop unused tables
-- ============================================

-- face_training_sessions: Training UI was disabled, no sessions being created
-- tournament_results: 0 code references, abandoned table
-- gallery_co_occurrence: 0 code references, abandoned table
-- event_players: Only counted in integrity check, never queried for data
-- telegram_bots: Only counted in integrity check, never queried for data

DROP TABLE IF EXISTS face_training_sessions CASCADE;
DROP TABLE IF EXISTS tournament_results CASCADE;
DROP TABLE IF EXISTS gallery_co_occurrence CASCADE;
DROP TABLE IF EXISTS event_players CASCADE;
DROP TABLE IF EXISTS telegram_bots CASCADE;

-- ============================================
-- Verification queries (run manually after migration)
-- ============================================

-- Check columns were removed:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'photo_faces' AND column_name IN ('training_used', 'training_context');
-- Should return 0 rows

-- Check tables were removed:
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public' AND tablename IN ('face_training_sessions', 'tournament_results', 'gallery_co_occurrence', 'event_players', 'telegram_bots');
-- Should return 0 rows
