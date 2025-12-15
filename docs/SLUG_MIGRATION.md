# Slug Migration Guide

## Overview
This migration adds human-readable URLs to the application:
- **Players**: `/players/rockpick` instead of `/players/uuid`
- **Galleries**: `/gallery/tournament-19-10` instead of `/gallery/uuid`
- **Photos**: `?photo=img-1234` instead of `?photo=uuid`

## Migration Status

### ✅ Backend Ready
- `python/core/slug.py` - utility functions for slug resolution
- `python/routers/people.py` - supports both UUID and slug
- `python/routers/galleries.py` - supports both UUID and slug

### ⏳ Database Migration Required
Run `scripts/052_add_slugs_and_featured.sql` in Supabase SQL Editor

### ⏳ Frontend Changes Needed
Update routes and links to use slugs

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
1. Use `title-DD-MM` (shoot_date)
2. Fallback to `gallery-{uuid}`

**Photos:**
1. Use `original_filename` (without extension)
2. Fallback to `photo-{uuid}`

**Duplicate handling:** Automatic suffix `-2`, `-3`, etc.

### Examples

```
@rockpick → rockpick
@rockpick (duplicate) → rockpick-2
Иван Петров → иван-петров
IVIN Padel Tournament 15.12 → ivin-padel-tournament-15-12
IMG_1234.jpg → img-1234
```

## Running the Migration

```bash
# 1. Run SQL script in Supabase SQL Editor
# Copy contents of scripts/052_add_slugs_and_featured.sql

# 2. Verify slugs generated
SELECT 'people' as tbl, COUNT(*) as total, COUNT(slug) as with_slug FROM people
UNION ALL
SELECT 'galleries', COUNT(*), COUNT(slug) FROM galleries
UNION ALL
SELECT 'gallery_images', COUNT(*), COUNT(slug) FROM gallery_images;

# 3. If all good, make slugs required (optional):
ALTER TABLE people ALTER COLUMN slug SET NOT NULL;
ALTER TABLE galleries ALTER COLUMN slug SET NOT NULL;
ALTER TABLE gallery_images ALTER COLUMN slug SET NOT NULL;

# 4. Restart backend for API changes
```

## Backend API

After migration, all endpoints accept **both UUID and slug**:

```
# Both work:
GET /api/people/550e8400-e29b-41d4-a716-446655440000
GET /api/people/rockpick

GET /api/galleries/550e8400-e29b-41d4-a716-446655440000
GET /api/galleries/ivin-padel-tournament-15-12
```

The API automatically detects if the identifier is a UUID or slug and searches accordingly.

## Frontend Changes Required

### 1. Update Routes

```
app/players/[id]/page.tsx → app/players/[slug]/page.tsx
app/gallery/[id]/page.tsx → app/gallery/[slug]/page.tsx
```

### 2. Update Links

```tsx
// Before
<Link href={`/players/${person.id}`}>

// After  
<Link href={`/players/${person.slug || person.id}`}>
```

### 3. Update Page Params

```tsx
// Before
export default function PlayerPage({ params }: { params: { id: string } }) {

// After
export default function PlayerPage({ params }: { params: { slug: string } }) {
```

### 4. API Responses Include Slug

All API responses now include `slug` field where applicable.

## Featured Photos

- Admin can mark 3-5 photos as "featured" per gallery
- Gallery cards randomly rotate featured photos for variety
- If no featured photos, use `cover_image_url`

## Backward Compatibility

✅ **Old UUID URLs continue to work** - the backend accepts both formats
✅ **No breaking changes** - existing integrations are safe
✅ **Gradual migration** - update frontend at your own pace

## Rollback

```sql
ALTER TABLE people DROP COLUMN IF EXISTS slug;
ALTER TABLE galleries DROP COLUMN IF EXISTS slug;
ALTER TABLE gallery_images DROP COLUMN IF EXISTS slug;
ALTER TABLE gallery_images DROP COLUMN IF EXISTS is_featured;
DROP FUNCTION IF EXISTS generate_unique_slug;
```
