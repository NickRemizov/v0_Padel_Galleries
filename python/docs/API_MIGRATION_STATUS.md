# API Migration Status

## Completed

### Phase 1: Core Foundation ✅
- [x] `core/config.py` - Settings via dataclass + os.getenv
- [x] `core/exceptions.py` - Exception hierarchy
- [x] `core/responses.py` - ApiResponse generic
- [x] `core/logging.py` - Centralized logging
- [x] Global exception handlers in main.py

### Phase 2: Infrastructure ✅
- [x] `infrastructure/supabase.py` - Unified client
- [x] `infrastructure/storage.py` - Photo cache, image utils

### Phase 3: Domain Models ✅
- [x] `models/domain/face.py` - Face, BoundingBox, FaceQuality
- [x] `models/domain/person.py` - Person, PersonSummary
- [x] `models/domain/gallery.py` - Gallery, GalleryImage
- [x] `models/domain/training.py` - TrainingSession, TrainingConfig
- [x] `models/requests/` - Request DTOs
- [x] `models/responses/` - Response DTOs

### Phase 4: Repositories ✅
- [x] `repositories/base.py` - BaseRepository with generic CRUD
- [x] `repositories/faces_repo.py` - FacesRepository
- [x] `repositories/people_repo.py` - PeopleRepository
- [x] `repositories/galleries_repo.py` - GalleriesRepository
- [x] `repositories/config_repo.py` - ConfigRepository
- [x] `repositories/training_repo.py` - TrainingRepository

## In Progress

### Phase 5: Service Integration
- [ ] Services use repositories instead of direct queries
- [ ] Services throw custom exceptions
- [ ] Remove duplication between services

### Phase 6: Router Unification
- [ ] All routers return ApiResponse
- [ ] Split large routers into modules
- [ ] Consistent endpoint naming

## Pending

### Phase 7: Cleanup
- [ ] Remove `services/supabase_client.py` (merged into infrastructure/)
- [ ] Remove `services/supabase_database.py` (merged into infrastructure/)
- [ ] Update all imports
- [ ] API documentation update

## Endpoints Status

| Router | ApiResponse | Repository | Status |
|--------|-------------|------------|--------|
| /api/health | ✅ | N/A | Done |
| /api/recognition/* | ❌ | ❌ | Legacy |
| /api/faces/* | ❌ | ❌ | Legacy |
| /api/v2/training/* | ❌ | ❌ | Legacy |
| /api/config/* | ❌ | ❌ | Legacy |
| /api/images/* | ❌ | ❌ | Legacy |
| /api/photographers/* | ❌ | ❌ | Legacy |
| /api/people/* | ❌ | ❌ | Legacy |
| /api/galleries/* | ❌ | ❌ | Legacy |
| /api/locations/* | ❌ | ❌ | Legacy |
| /api/organizers/* | ❌ | ❌ | Legacy |
| /api/cities/* | ❌ | ❌ | Legacy |

## Breaking Changes

None - new architecture is additive. Old code continues to work.

## Notes

- New architecture is ready for use in new features
- Existing endpoints work unchanged
- Gradual migration recommended
- Priority: recognition and training endpoints first
