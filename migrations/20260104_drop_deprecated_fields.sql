-- ============================================================
-- МИГРАЦИЯ: Удаление deprecated полей и таблиц
-- Дата: 04.01.2026
-- ============================================================
--
-- Удаляем устаревшие поля, которые были помечены как DEPRECATED:
-- 1. Таблица face_descriptors_DEPRECATED (не используется)
-- 2. Колонка photo_faces.bounding_box_DEPRECATED (заменена на insightface_bbox)
-- 3. Колонка photo_faces.confidence_DEPRECATED (заменена на insightface_det_score)
--
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DROP TABLE face_descriptors_DEPRECATED
-- ============================================================

DROP TABLE IF EXISTS face_descriptors_DEPRECATED CASCADE;
DROP TABLE IF EXISTS face_descriptors CASCADE;

RAISE NOTICE 'Dropped face_descriptors tables';


-- ============================================================
-- 2. DROP COLUMN photo_faces.bounding_box_DEPRECATED
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photo_faces' AND column_name = 'bounding_box_deprecated'
    ) THEN
        ALTER TABLE photo_faces DROP COLUMN bounding_box_DEPRECATED;
        RAISE NOTICE 'Dropped photo_faces.bounding_box_DEPRECATED';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photo_faces' AND column_name = 'bounding_box'
    ) THEN
        ALTER TABLE photo_faces DROP COLUMN bounding_box;
        RAISE NOTICE 'Dropped photo_faces.bounding_box';
    END IF;
END $$;


-- ============================================================
-- 3. DROP COLUMN photo_faces.confidence_DEPRECATED
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photo_faces' AND column_name = 'confidence_deprecated'
    ) THEN
        ALTER TABLE photo_faces DROP COLUMN confidence_DEPRECATED;
        RAISE NOTICE 'Dropped photo_faces.confidence_DEPRECATED';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photo_faces' AND column_name = 'confidence'
    ) THEN
        ALTER TABLE photo_faces DROP COLUMN confidence;
        RAISE NOTICE 'Dropped photo_faces.confidence';
    END IF;
END $$;


-- ============================================================
-- 4. Проверка результата
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'DEPRECATED FIELDS CLEANUP COMPLETE';
    RAISE NOTICE '============================================================';
END $$;

COMMIT;
