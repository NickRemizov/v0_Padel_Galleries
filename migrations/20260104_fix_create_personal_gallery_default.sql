-- Fix default value for create_personal_gallery (should be true, not false)
ALTER TABLE people ALTER COLUMN create_personal_gallery SET DEFAULT true;

-- Update existing rows that have false (from wrong default)
UPDATE people SET create_personal_gallery = true WHERE create_personal_gallery = false;
