-- ============================================================================
-- Миграция: Изменение типа paddle_ranking с integer на numeric
-- Дата: 14.12.2025
-- Версия: 1.0
-- ============================================================================

-- Изменить тип paddle_ranking с integer на numeric (для шага 0.25)
ALTER TABLE people 
ALTER COLUMN paddle_ranking TYPE numeric USING paddle_ranking::numeric;

-- Добавить комментарий к полю
COMMENT ON COLUMN people.paddle_ranking IS 'Уровень игрока в падел (0-10, шаг 0.25)';

-- Проверка
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'people' AND column_name = 'paddle_ranking';
