-- Migration: Remove dead tables
-- Date: 2026-01-10
-- Description: Cleanup of unused database objects identified during dead code audit

-- ============================================
-- Drop unused tables
-- ============================================

-- face_training_sessions: Training UI was disabled, no sessions being created
-- gallery_co_occurrence: 0 code references, abandoned table

DROP TABLE IF EXISTS face_training_sessions CASCADE;
DROP TABLE IF EXISTS gallery_co_occurrence CASCADE;

-- ============================================
-- Verification queries (run manually after migration)
-- ============================================

-- Check tables were removed:
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public' AND tablename IN ('face_training_sessions', 'gallery_co_occurrence');
-- Should return 0 rows
