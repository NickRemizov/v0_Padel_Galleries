-- Migration: Add is_public to galleries
-- Existing galleries become public, new galleries default to private

-- Step 1: Add column with DEFAULT true (sets all existing rows to true)
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- Step 2: Create index for filtering
CREATE INDEX IF NOT EXISTS idx_galleries_is_public ON galleries(is_public);

-- Step 3: Change default for new rows to false
ALTER TABLE galleries ALTER COLUMN is_public SET DEFAULT false;

-- Verify
SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_public = true) as public_count,
    COUNT(*) FILTER (WHERE is_public = false) as private_count
FROM galleries;
