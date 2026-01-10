-- Migration: Remove dead tables and columns
-- Date: 2026-01-10
-- Description: Cleanup of unused database objects identified during dead code audit
--
-- Analysis:
-- - training_used, training_context: written but never read
-- - face_training_sessions: Training UI disabled, frontend can't call API
-- - gallery_co_occurrence: 0 code references, never implemented
-- - backup tables: old artifacts

-- ============================================
-- PHASE 1: Remove unused columns from photo_faces
-- ============================================

ALTER TABLE photo_faces
DROP COLUMN IF EXISTS training_used,
DROP COLUMN IF EXISTS training_context;

-- ============================================
-- PHASE 2: Drop unused tables
-- ============================================

DROP TABLE IF EXISTS face_training_sessions CASCADE;
DROP TABLE IF EXISTS gallery_co_occurrence CASCADE;

-- ============================================
-- PHASE 3: Drop backup/artifact tables
-- ============================================

DROP TABLE IF EXISTS _backup_telegram_profile_url CASCADE;
DROP TABLE IF EXISTS photo_faces_backup_20251124_011201 CASCADE;

-- ============================================
-- Verification queries (run manually after migration)
-- ============================================

-- Check columns were removed:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'photo_faces' AND column_name IN ('training_used', 'training_context');
-- Should return 0 rows

-- Check tables were removed:
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('face_training_sessions', 'gallery_co_occurrence',
--                     '_backup_telegram_profile_url', 'photo_faces_backup_20251124_011201');
-- Should return 0 rows
