-- ============================================================
-- МИГРАЦИЯ: Переименование Legacy полей в DEPRECATED
-- Дата: 14.12.2025
-- Версия: 1.0
-- ============================================================
-- 
-- ЦЕЛЬ: Защита от случайного использования устаревших полей.
-- После переименования любая попытка использовать старые имена
-- вызовет ошибку, что сразу покажет проблему.
--
-- МОЖНО ОТКАТИТЬ: См. секцию ROLLBACK в конце файла
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ТАБЛИЦА face_descriptors → face_descriptors_DEPRECATED
-- ============================================================
-- Эта таблица больше не используется.
-- Все эмбеддинги хранятся в photo_faces.insightface_descriptor

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'face_descriptors') THEN
        ALTER TABLE face_descriptors RENAME TO face_descriptors_DEPRECATED;
        RAISE NOTICE '✓ Таблица face_descriptors переименована в face_descriptors_DEPRECATED';
    ELSE
        RAISE NOTICE '⚠ Таблица face_descriptors не найдена (возможно уже переименована)';
    END IF;
END $$;

-- Добавляем комментарий
COMMENT ON TABLE face_descriptors_DEPRECATED IS 
    '⛔ DEPRECATED: НЕ ИСПОЛЬЗОВАТЬ! Это legacy таблица. Все данные в photo_faces.insightface_descriptor. Будет удалена после 01.02.2025.';


-- ============================================================
-- 2. ПОЛЕ photo_faces.bounding_box → bounding_box_DEPRECATED  
-- ============================================================
-- Заменено на photo_faces.insightface_bbox

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'photo_faces' AND column_name = 'bounding_box'
    ) THEN
        ALTER TABLE photo_faces RENAME COLUMN bounding_box TO bounding_box_DEPRECATED;
        RAISE NOTICE '✓ Поле bounding_box переименовано в bounding_box_DEPRECATED';
    ELSE
        RAISE NOTICE '⚠ Поле bounding_box не найдено (возможно уже переименовано или не существует)';
    END IF;
END $$;


-- ============================================================
-- 3. ПОЛЕ photo_faces.confidence → confidence_DEPRECATED
-- ============================================================
-- Заменено на photo_faces.insightface_confidence

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'photo_faces' AND column_name = 'confidence'
    ) THEN
        ALTER TABLE photo_faces RENAME COLUMN confidence TO confidence_DEPRECATED;
        RAISE NOTICE '✓ Поле confidence переименовано в confidence_DEPRECATED';
    ELSE
        RAISE NOTICE '⚠ Поле confidence не найдено (возможно уже переименовано или не существует)';
    END IF;
END $$;


-- ============================================================
-- 4. Добавляем комментарии к DEPRECATED полям
-- ============================================================

DO $$
BEGIN
    -- Комментарий к bounding_box_DEPRECATED
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'photo_faces' AND column_name = 'bounding_box_deprecated'
    ) THEN
        COMMENT ON COLUMN photo_faces.bounding_box_DEPRECATED IS 
            '⛔ DEPRECATED: Использовать insightface_bbox';
    END IF;
    
    -- Комментарий к confidence_DEPRECATED
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'photo_faces' AND column_name = 'confidence_deprecated'
    ) THEN
        COMMENT ON COLUMN photo_faces.confidence_DEPRECATED IS 
            '⛔ DEPRECATED: Использовать insightface_confidence';
    END IF;
END $$;


-- ============================================================
-- 5. Проверка результатов
-- ============================================================

DO $$
DECLARE
    deprecated_table_exists BOOLEAN;
    deprecated_bbox_exists BOOLEAN;
    deprecated_conf_exists BOOLEAN;
BEGIN
    -- Проверяем таблицу
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'face_descriptors_deprecated'
    ) INTO deprecated_table_exists;
    
    -- Проверяем поля
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'photo_faces' AND column_name = 'bounding_box_deprecated'
    ) INTO deprecated_bbox_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'photo_faces' AND column_name = 'confidence_deprecated'
    ) INTO deprecated_conf_exists;
    
    RAISE NOTICE '';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'РЕЗУЛЬТАТЫ МИГРАЦИИ:';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'face_descriptors_DEPRECATED: %', CASE WHEN deprecated_table_exists THEN '✓ OK' ELSE '✗ НЕ НАЙДЕНА' END;
    RAISE NOTICE 'bounding_box_DEPRECATED: %', CASE WHEN deprecated_bbox_exists THEN '✓ OK' ELSE '✗ НЕ НАЙДЕНО (или не было)' END;
    RAISE NOTICE 'confidence_DEPRECATED: %', CASE WHEN deprecated_conf_exists THEN '✓ OK' ELSE '✗ НЕ НАЙДЕНО (или не было)' END;
    RAISE NOTICE '============================================================';
END $$;


COMMIT;

-- ============================================================
-- ROLLBACK (если нужно откатить)
-- ============================================================
-- 
-- BEGIN;
-- 
-- -- Откат таблицы
-- ALTER TABLE face_descriptors_DEPRECATED RENAME TO face_descriptors;
-- 
-- -- Откат полей
-- ALTER TABLE photo_faces RENAME COLUMN bounding_box_DEPRECATED TO bounding_box;
-- ALTER TABLE photo_faces RENAME COLUMN confidence_DEPRECATED TO confidence;
-- 
-- COMMIT;
-- ============================================================
