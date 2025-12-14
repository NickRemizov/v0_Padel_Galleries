-- ============================================================================
-- Миграция: Добавление gmail и обновление telegram полей
-- Дата: 14.12.2025
-- Версия: 1.0
-- ============================================================================

-- ============================================================================
-- ШАГ 1: Добавить поле gmail в таблицу people
-- ============================================================================

ALTER TABLE people ADD COLUMN IF NOT EXISTS gmail TEXT;

-- Добавить комментарий к полю
COMMENT ON COLUMN people.gmail IS 'Gmail адрес для OAuth авторизации (формат: user@gmail.com)';

-- ============================================================================
-- ШАГ 2: Миграция данных telegram_profile_url → telegram_nickname
-- 
-- Логика:
-- 1. Если telegram_profile_url заполнен в формате https://t.me/username
-- 2. И telegram_nickname пустой
-- 3. Извлекаем username и записываем в telegram_nickname с @
-- ============================================================================

-- Сначала проверим, какие данные есть
SELECT 
    id,
    real_name,
    telegram_nickname,
    telegram_profile_url
FROM people
WHERE telegram_profile_url IS NOT NULL 
  AND telegram_profile_url != ''
  AND (telegram_nickname IS NULL OR telegram_nickname = '');

-- Выполнить миграцию: извлечь username из telegram_profile_url
UPDATE people
SET telegram_nickname = '@' || REGEXP_REPLACE(telegram_profile_url, '^https?://t\.me/', '')
WHERE telegram_profile_url IS NOT NULL 
  AND telegram_profile_url != ''
  AND telegram_profile_url LIKE '%t.me/%'
  AND (telegram_nickname IS NULL OR telegram_nickname = '');

-- Показать результат миграции
SELECT 
    id,
    real_name,
    telegram_nickname,
    telegram_profile_url
FROM people
WHERE telegram_nickname IS NOT NULL 
  AND telegram_nickname != '';

-- ============================================================================
-- ШАГ 3: Очистить telegram_profile_url (он будет заполняться ботом)
-- ============================================================================

-- Сохраним резервную копию перед очисткой
CREATE TABLE IF NOT EXISTS _backup_telegram_profile_url AS
SELECT id, real_name, telegram_profile_url, NOW() as backup_date
FROM people
WHERE telegram_profile_url IS NOT NULL AND telegram_profile_url != '';

-- Очистить поле telegram_profile_url
UPDATE people
SET telegram_profile_url = NULL
WHERE telegram_profile_url IS NOT NULL;

-- ============================================================================
-- ШАГ 4: Добавить индекс на gmail (для быстрого поиска при OAuth)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_people_gmail ON people(gmail) WHERE gmail IS NOT NULL;

-- ============================================================================
-- ИТОГОВАЯ ПРОВЕРКА
-- ============================================================================

SELECT 
    'gmail добавлен' as check_item,
    COUNT(*) as count
FROM people WHERE gmail IS NOT NULL

UNION ALL

SELECT 
    'telegram_nickname заполнен' as check_item,
    COUNT(*) as count
FROM people WHERE telegram_nickname IS NOT NULL AND telegram_nickname != ''

UNION ALL

SELECT 
    'telegram_profile_url очищен' as check_item,
    COUNT(*) as count
FROM people WHERE telegram_profile_url IS NULL OR telegram_profile_url = '';

-- ============================================================================
-- ROLLBACK (если нужно откатить)
-- ============================================================================
/*
-- Восстановить telegram_profile_url из резервной копии
UPDATE people p
SET telegram_profile_url = b.telegram_profile_url
FROM _backup_telegram_profile_url b
WHERE p.id = b.id;

-- Удалить поле gmail
ALTER TABLE people DROP COLUMN IF EXISTS gmail;

-- Удалить индекс
DROP INDEX IF EXISTS idx_people_gmail;

-- Удалить резервную таблицу
DROP TABLE IF EXISTS _backup_telegram_profile_url;
*/
