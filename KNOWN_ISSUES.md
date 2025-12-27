# Known Issues & Technical Debt

Last updated: 2025-12-27

## Critical Issues

### 1. TypeScript Type Inconsistencies
**Status:** Open  
**Priority:** Medium  
**Location:** `lib/types.ts`, various components

`GalleryImage` type doesn't include `people[]` array, but `gallery-view.tsx` uses `(image as any).people`.
Runtime works, but type safety is broken.

**To fix:**
```typescript
// lib/types.ts
export interface GalleryImage {
  // ... existing fields
  people?: Array<{ id: string; name: string }>
}
```

## Technical Debt

### 1. Full Codebase Audit Needed
**Status:** Open  
**Priority:** High  

Unknown number of "compatibility workarounds" in codebase from rapid migrations.
Need systematic audit for:
- Duplicate data formats (like the fixed `_count` vs `photo_count`)
- `as any` type casts masking real issues
- Dead code from migrations
- Mismatches between TypeScript types and actual API responses

**Task file:** See `audit-task.md` (created 2025-12-27)

### 2. Direct Supabase Access Remaining
**Status:** Partially resolved  
**Priority:** Low  

Some server actions still use direct Supabase client instead of FastAPI.
These are auth-related and intentional (Supabase handles auth).

**Files with direct Supabase:**
- `app/admin/actions/auth.ts` - auth operations (OK)
- `lib/supabase/server.ts` - server client creation (OK)

## Recently Fixed

### 2025-12-27: photo_count Unification
**Commits:** `f59f2ee`, `8a0f8ec`

**Problem:** API returned same data in two formats:
- `_count.gallery_images` (Prisma legacy)
- `photo_count` (simple format)

**Fix:** Unified to `photo_count` everywhere:
- `lib/types.ts` - Gallery type
- `components/gallery-card.tsx` - usage
- `python/routers/galleries.py` - API response

### 2025-12-27: photo_faces.confidence Column Error
**Commit:** `8a0f8ec`

**Problem:** Query used non-existent `confidence` column in photo_faces table.

**Fix:** Removed column from SELECT (not needed for people lookup).

## Process Improvements

From 2025-12-27 session, established rules:
1. **Audit BEFORE coding** - find ALL usage points first
2. **Single format** - never return same data in multiple formats
3. **Atomic changes** - backend + frontend in same commit when format changes
4. **Verify column names** - check actual DB schema before writing queries
