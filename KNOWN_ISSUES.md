# Known Issues & Technical Debt

Last updated: 2026-01-01

## Critical Issues

*No critical issues at this time.*

## Architecture Decisions

### Direct Supabase Access in Admin Actions
**Status:** Intentional  
**Decision date:** 2025-12-31

Admin service actions (`cleanup.ts`, `debug.ts`, `integrity/*`) access Supabase directly instead of going through FastAPI. This is **intentionally left as-is** because:
- These are rarely-used service/debug functions
- Migration effort not justified for low-usage features
- May be disabled entirely in the future

**Files:**
- `app/admin/actions/cleanup.ts`
- `app/admin/actions/debug.ts`
- `app/admin/actions/integrity/*`

**Note:** If these functions are used frequently or cause FAISS index sync issues, consider migrating to FastAPI endpoints.

### Social Layer on Frontend
**Status:** Intentional

Social features (comments, likes, favorites) use direct Supabase access from Next.js. This is by design — social data is separate from core recognition domain.

## Technical Debt

### 1. Unused API Routes
**Status:** Documented  
**Priority:** Low  

Several Next.js API routes exist but have no frontend calls:
- `app/api/admin/check-gallery/`
- `app/api/admin/debug-gallery/`
- `app/api/face-detection/detect/`
- `app/api/face-detection/recognize/`
- `app/api/favorites/` (list endpoint)
- `app/api/galleries/` and `[id]/`
- `app/api/images/[imageId]/auto-recognize/`
- `app/api/recognition/rebuild-index/`
- `app/api/revalidate/`

**Decision:** Keep for now. Review when doing major cleanup.

### 2. Dead Code Candidates
**Status:** Pending review
**Priority:** Low

Files with 0 imports (candidates for deletion):
- `lib/debounce.ts`
- `lib/supabase/client.ts`
- `lib/supabase/safe-call.ts`
- `lib/supabase/with-supabase.ts`

**Decision:** Owner to review and delete manually if confirmed unused.

### 3. Security: Hardcoded Fallback Secret
**Status:** Open  
**Priority:** Low  
**Location:** `app/api/revalidate/route.ts:15`

`REVALIDATE_TOKEN` has hardcoded fallback `"padel-revalidate-2024"`. Should require env var.

### 4. Auth Role Check Disabled
**Status:** Documented (do not change without auth review)  
**Location:** `lib/auth/serverGuard.ts:27-37`

Role-based admin check is commented out. Currently only checks authentication, not authorization.
Re-enable after Supabase roles are configured.

## Recently Fixed

### 2025-12-31: Codebase Audit Completed

Full audit of v0 export completed. Key findings addressed:
- P0-1: `confidence` → `recognition_confidence` in debug.ts
- P0-2: ApiResponse parsing in global-unknown-faces-dialog.tsx
- Documentation updated to reflect actual code state

**Audit document:** `AI_HANDOFF_RECOMMENDATIONS.md`

### 2025-12-31: P0 Fixes

**Commit:** `97205d7` - fix(P0-1): replace deprecated 'confidence' with 'recognition_confidence'  
**Commit:** `2b9b5e2` - fix(P0-2): correctly parse ApiResponse envelope in loadConfig()

### 2025-12-27: photo_count Unification

**Problem:** API returned same data in two formats  
**Fix:** Unified to `photo_count` everywhere

## Process Rules

1. **Audit BEFORE coding** - find ALL usage points first
2. **Single format** - never return same data in multiple formats
3. **Atomic changes** - backend + frontend in same commit when format changes
4. **Verify column names** - check actual DB schema before writing queries
5. **Check API response format** - Next routes return ApiResponse envelope
6. **Verify migrations applied** - column renames affect all code using old names
