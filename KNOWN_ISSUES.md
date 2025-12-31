# Known Issues & Technical Debt

Last updated: 2025-12-31

## Critical Issues

*No critical issues at this time.*

## Technical Debt

### 1. Full Codebase Audit Needed
**Status:** In Progress  
**Priority:** High  

Unknown number of "compatibility workarounds" in codebase from rapid migrations.
Need systematic audit for:
- Duplicate data formats (like the fixed `_count` vs `photo_count`)
- `as any` type casts masking real issues
- Dead code from migrations
- Mismatches between TypeScript types and actual API responses

**Task file:** See `AI_HANDOFF_RECOMMENDATIONS.md` (audit completed 2025-12-31)

### 2. Direct Supabase Access in Admin Actions
**Status:** Documented  
**Priority:** Medium  

Some admin server actions still use direct Supabase client instead of FastAPI.
Plan: migrate core domain writes to FastAPI endpoints (Phase 1 in handoff doc).

**Files with direct Supabase (admin):**
- `app/admin/actions/cleanup.ts`
- `app/admin/actions/debug.ts`
- `app/admin/actions/integrity/*`

**Explicitly allowed (not to migrate):**
- Social layer: comments, likes, favorites
- Auth/telegram mapping

### 3. Unused API Routes
**Status:** Documented  
**Priority:** Low  

Several Next.js API routes exist but have no frontend calls.
See `AI_HANDOFF_RECOMMENDATIONS.md` section "Non-used Next API routes" for full list.

### 4. Security: Hardcoded Fallback Secret
**Status:** Open  
**Priority:** Low  
**Location:** `app/api/revalidate/route.ts`

`REVALIDATE_TOKEN` has hardcoded fallback value. Should require env var.

## Recently Fixed

### 2025-12-31: P0 Fixes from Audit

**Commit:** `97205d7` - fix(P0-1): replace deprecated 'confidence' with 'recognition_confidence'  
**Commit:** `2b9b5e2` - fix(P0-2): correctly parse ApiResponse envelope in loadConfig()

**P0-1: photo_faces.confidence in debug.ts**
- **Problem:** `app/admin/actions/debug.ts` used deprecated `confidence` column
- **Fix:** Replaced all usage with `recognition_confidence` (the correct column per migration 20241214)

**P0-2: ApiResponse envelope parsing**
- **Problem:** `components/admin/global-unknown-faces-dialog.tsx` read config as raw JSON
- **Fix:** Now correctly parses `result.data.auto_avatar_on_create`

### 2025-12-31: GalleryImage.people Type
**Status:** Was already fixed

**Problem (documented 2025-12-27):** `GalleryImage` type missing `people[]` array.  
**Reality:** `lib/types.ts` already includes `people?: ImagePerson[]`. Documentation was outdated.

### 2025-12-27: photo_count Unification
**Commits:** `f59f2ee`, `8a0f8ec`

**Problem:** API returned same data in two formats:
- `_count.gallery_images` (Prisma legacy)
- `photo_count` (simple format)

**Fix:** Unified to `photo_count` everywhere.

## Process Improvements

From 2025-12-27 session, established rules:
1. **Audit BEFORE coding** - find ALL usage points first
2. **Single format** - never return same data in multiple formats
3. **Atomic changes** - backend + frontend in same commit when format changes
4. **Verify column names** - check actual DB schema before writing queries

From 2025-12-31 audit:
5. **Check API response format** - Next routes return ApiResponse envelope, parse accordingly
6. **Verify migrations applied** - column renames affect all code using old names
