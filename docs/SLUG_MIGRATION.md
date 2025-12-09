# Slug Migration Guide

## Overview
This migration adds human-readable URLs to the application:
- **Players**: `/players/rockpick` instead of `/players/uuid`
- **Galleries**: `/gallery/tournament-19-10` instead of `/gallery/uuid`
- **Photos**: `?photo=img-1234` instead of `?photo=uuid`

## Database Changes

### New Fields

**people table:**
- `slug` VARCHAR(255) UNIQUE - URL-friendly player identifier

**galleries table:**
- `slug` VARCHAR(255) UNIQUE - URL-friendly gallery identifier

**gallery_images table:**
- `slug` VARCHAR(255) - URL-friendly photo identifier (unique within gallery)
- `is_featured` BOOLEAN - Mark photos for thumbnail rotation (3-5 recommended)

### Slug Generation Logic

**Players:** 
1. Use `telegram_nickname` (without @)
2. Fallback to `real_name`
3. Fallback to `telegram_name`
4. Fallback to `player-{uuid}`

**Galleries:**
1. Use `title-DD-MM` (event date)
2. Fallback to `gallery-{uuid}`

**Photos:**
1. Use `original_filename` (without extension)
2. Fallback to `photo-{uuid}`

**Duplicate handling:** Automatic suffix `-2`, `-3`, etc.

### Examples

\`\`\`
@rockpick → rockpick
@rockpick (duplicate) → rockpick-2
Иван Петров → ivan-petrov
IVIN Padel Tournament → ivin-padel-tournament
IMG_1234.jpg → img-1234
\`\`\`

## Running the Migration

\`\`\`bash
# 1. Run SQL script
psql -U your_user -d your_database -f scripts/052_add_slugs_and_featured.sql

# 2. Verify slugs generated
SELECT id, real_name, slug FROM people WHERE slug IS NULL;
SELECT id, title, slug FROM galleries WHERE slug IS NULL;

# 3. If all good, make slugs required (uncomment in SQL file):
ALTER TABLE people ALTER COLUMN slug SET NOT NULL;
ALTER TABLE galleries ALTER COLUMN slug SET NOT NULL;
ALTER TABLE gallery_images ALTER COLUMN slug SET NOT NULL;
\`\`\`

## Backend Changes Required

1. Update FastAPI endpoints to accept slug OR uuid
2. Add slug generation on record creation
3. Update queries to search by slug first, fallback to uuid

## Frontend Changes Required

1. Update routes: `[id]` → `[slug]`
2. Update all `href` links to use slug
3. Update page params to accept slug
4. Add slug to API responses

## Featured Photos

- Admin can mark 3-5 photos as "featured" per gallery
- Gallery cards randomly rotate featured photos for variety
- If no featured photos, use `cover_image_url`

## Rollback

\`\`\`sql
ALTER TABLE people DROP COLUMN IF EXISTS slug;
ALTER TABLE galleries DROP COLUMN IF EXISTS slug;
ALTER TABLE gallery_images DROP COLUMN IF EXISTS slug;
ALTER TABLE gallery_images DROP COLUMN IF EXISTS is_featured;
DROP FUNCTION IF EXISTS generate_unique_slug;
