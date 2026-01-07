-- Migration: Add welcome message system
-- 1. Add welcome_version_seen to users table
-- 2. Create site_content table for welcome message and other content

-- Add welcome_version_seen to users (0 = never seen)
ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_version_seen INTEGER DEFAULT 0;

-- Create site_content table for editable content
CREATE TABLE IF NOT EXISTS site_content (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial welcome content
INSERT INTO site_content (key, value) VALUES (
    'welcome',
    '{
        "version": 1,
        "title": "Добро пожаловать!",
        "content": "## Что здесь можно делать?\n\n- **Галереи** — смотреть фото с турниров и мероприятий\n- **Игроки** — найти себя и других игроков\n- **Мои фото** — все фото, где вы отмечены\n- **Настройки** — управление приватностью\n\n### Как это работает?\n\nСистема автоматически распознаёт лица на фотографиях. Вы можете подтвердить или отклонить предложенные совпадения в разделе \"Мои фото\"."
    }'::jsonb
) ON CONFLICT (key) DO NOTHING;
