-- Migration: Add Google authentication support
-- Allows users to login via Google in addition to Telegram

-- Step 1: Add google_id column for Google OAuth
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- Step 2: Add email column (from Google)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Step 3: Make telegram_id nullable (user can login via Google only)
ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;

-- Step 4: Add index for google_id lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Step 5: Add constraint - at least one auth method must be present
-- (Cannot add CHECK constraint easily with ALTER, so we'll enforce in app)

-- Verify
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('telegram_id', 'google_id', 'email')
ORDER BY column_name;
