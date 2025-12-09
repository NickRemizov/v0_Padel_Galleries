-- Migration: Add slug fields and featured photos support
-- Purpose: Enable human-readable URLs for players, galleries, and photos

-- ===================================================================
-- 1. ADD SLUG COLUMNS
-- ===================================================================

-- Add slug to people table
ALTER TABLE people ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

-- Add slug to galleries table  
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

-- Add slug and is_featured to gallery_images table
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- ===================================================================
-- 2. CREATE UNIQUE INDEXES
-- ===================================================================

-- Unique constraint on people.slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_slug ON people(slug) WHERE slug IS NOT NULL;

-- Unique constraint on galleries.slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_galleries_slug ON galleries(slug) WHERE slug IS NOT NULL;

-- Unique constraint on gallery_images.slug within same gallery
CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_images_slug ON gallery_images(gallery_id, slug) WHERE slug IS NOT NULL;

-- Index for featured photos lookup
CREATE INDEX IF NOT EXISTS idx_gallery_images_featured ON gallery_images(gallery_id, is_featured) WHERE is_featured = true;

-- ===================================================================
-- 3. HELPER FUNCTION: Generate unique slug
-- ===================================================================

CREATE OR REPLACE FUNCTION generate_unique_slug(
  base_text TEXT,
  table_name TEXT,
  column_name TEXT DEFAULT 'slug',
  exclude_id UUID DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  slug TEXT;
  counter INTEGER := 1;
  exists_check BOOLEAN;
BEGIN
  -- Generate base slug: lowercase, replace spaces/special chars with hyphens
  slug := lower(regexp_replace(base_text, '[^a-zA-Z0-9А-Яа-я]+', '-', 'g'));
  slug := trim(both '-' from slug);
  
  -- Remove consecutive hyphens
  slug := regexp_replace(slug, '-+', '-', 'g');
  
  -- Limit length
  slug := substring(slug from 1 for 200);
  
  -- Check uniqueness and add counter if needed
  LOOP
    -- Check if slug exists (excluding current record if updating)
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM %I WHERE %I = $1 AND ($2 IS NULL OR id != $2))',
      table_name, column_name
    ) INTO exists_check USING slug, exclude_id;
    
    EXIT WHEN NOT exists_check;
    
    -- Slug exists, try with counter
    counter := counter + 1;
    slug := substring(
      lower(regexp_replace(base_text, '[^a-zA-Z0-9А-Яа-я]+', '-', 'g'))
      from 1 for 190
    ) || '-' || counter;
    slug := trim(both '-' from slug);
  END LOOP;
  
  RETURN slug;
END;
$$ LANGUAGE plpgsql;

-- ===================================================================
-- 4. GENERATE SLUGS FOR EXISTING DATA
-- ===================================================================

-- Generate slugs for people (telegram_nickname → real_name → telegram_name)
UPDATE people
SET slug = generate_unique_slug(
  COALESCE(
    NULLIF(regexp_replace(telegram_nickname, '^@', ''), ''),
    real_name,
    telegram_name,
    'player-' || substr(id::text, 1, 8)
  ),
  'people'
)
WHERE slug IS NULL;

-- Generate slugs for galleries (title with date)
UPDATE galleries
SET slug = generate_unique_slug(
  COALESCE(
    title || '-' || to_char(event_date, 'DD-MM'),
    'gallery-' || substr(id::text, 1, 8)
  ),
  'galleries'
)
WHERE slug IS NULL;

-- Generate slugs for gallery_images (original_filename without extension)
UPDATE gallery_images
SET slug = (
  SELECT generate_unique_slug(
    COALESCE(
      regexp_replace(original_filename, '\.[^.]+$', ''), -- Remove extension
      'photo-' || substr(id::text, 1, 8)
    ),
    'gallery_images',
    'slug'
  )
)
WHERE slug IS NULL;

-- ===================================================================
-- 5. MAKE SLUGS REQUIRED FOR NEW RECORDS
-- ===================================================================

-- Note: NOT making them NOT NULL yet to allow gradual migration
-- Uncomment these after confirming all slugs are generated:
-- ALTER TABLE people ALTER COLUMN slug SET NOT NULL;
-- ALTER TABLE galleries ALTER COLUMN slug SET NOT NULL;
-- ALTER TABLE gallery_images ALTER COLUMN slug SET NOT NULL;

-- ===================================================================
-- 6. ADD COMMENTS
-- ===================================================================

COMMENT ON COLUMN people.slug IS 'URL-friendly identifier generated from telegram_nickname or real_name';
COMMENT ON COLUMN galleries.slug IS 'URL-friendly identifier generated from title and event date';
COMMENT ON COLUMN gallery_images.slug IS 'URL-friendly identifier generated from original filename';
COMMENT ON COLUMN gallery_images.is_featured IS 'Whether this image should be used in gallery thumbnail rotation (3-5 recommended)';

COMMENT ON FUNCTION generate_unique_slug IS 'Generates URL-safe slug with automatic counter suffix for duplicates';
