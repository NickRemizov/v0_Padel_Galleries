-- Migration: Add telegram_id and created_by to people table
-- Date: 2026-01-04
-- Purpose: Support auto-creation of person on Telegram login

-- 1. Add telegram_id column (Telegram's unique user ID, never changes)
ALTER TABLE people
ADD COLUMN IF NOT EXISTS telegram_id BIGINT;

-- 2. Add created_by column (who created this person record)
-- Values: 'auto_login' | 'admin:email@example.com'
ALTER TABLE people
ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 3. Create index on telegram_id for fast lookups during login
CREATE INDEX IF NOT EXISTS idx_people_telegram_id ON people(telegram_id) WHERE telegram_id IS NOT NULL;

-- 4. Set created_by for existing records (all created by admin, except system users)
UPDATE people
SET created_by = 'admin:nick.remizov@gmail.com'
WHERE created_by IS NULL
  AND telegram_nickname != '@nickr';

-- 5. Copy telegram_id from users table where we have a match
UPDATE people p
SET telegram_id = u.telegram_id
FROM users u
WHERE u.person_id = p.id
  AND p.telegram_id IS NULL;
