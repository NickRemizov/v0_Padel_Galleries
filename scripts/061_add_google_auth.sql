-- Migration: Add Google authentication to users table
-- Email хранится в people.gmail, дублировать в users не нужно

-- Добавить google_id (аналог telegram_id для Google)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- telegram_id nullable (можно войти только через Google)
ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;

-- Индекс для поиска по google_id
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
