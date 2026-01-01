# Backend Architecture v5.2

## Overview

Clean Architecture с разделением ответственности:

\`\`\`
python/
├── main.py                      # Entry point, DI, exception handlers
├── core/                        # Foundation (no dependencies)
│   ├── config.py               # Settings from env vars
│   ├── exceptions.py           # Custom exception hierarchy
│   ├── responses.py            # Unified ApiResponse format
│   └── logging.py              # Centralized logging
├── middleware/                  # Request/Response processing
│   └── auth.py                 # Centralized authentication
├── infrastructure/              # External systems
│   ├── supabase.py             # Unified DB client
│   └── storage.py              # Photo cache, image utils
├── repositories/                # Data access layer
├── services/                    # Business logic (see below)
└── routers/                     # HTTP endpoints (see below)
\`\`\`

## Modular Router Structure (v5.2)

Большие роутеры разбиты на модульные пакеты:

\`\`\`
routers/
├── people/                      # People CRUD, photos, embeddings
│   ├── __init__.py             # Router aggregation, DI
│   ├── crud.py                 # GET, POST, PUT, DELETE
│   ├── photos.py               # Person photos endpoints
│   ├── embeddings.py           # Descriptor management
│   ├── helpers.py              # Shared utilities
│   └── models.py               # Pydantic schemas
│
├── galleries/                   # Gallery management
│   ├── __init__.py             # Router aggregation, DI
│   ├── crud.py                 # GET /, GET /{id}, POST, PUT, DELETE
│   ├── photos.py               # /{id}/unprocessed-photos, etc.
│   ├── filters.py              # /with-unprocessed-photos, /with-unverified-faces
│   ├── stats.py                # /{id}/stats
│   ├── helpers.py              # get_supabase_db(), _resolve_gallery()
│   └── models.py               # GalleryCreate, GalleryUpdate
│
├── images/                      # Image management
│   ├── __init__.py             # Router aggregation
│   ├── gallery.py              # /gallery/{id} operations
│   ├── crud.py                 # /{id} delete, /batch-add
│   ├── processing.py           # /{id}/mark-processed, /auto-recognize
│   ├── faces.py                # /{id}/people
│   ├── helpers.py
│   └── models.py
│
├── recognition/                 # Face recognition
│   ├── __init__.py
│   ├── detect.py               # /detect-faces, /process-photo
│   ├── recognize.py            # /recognize-face
│   ├── clusters.py             # /cluster-unknown-faces
│   ├── descriptors/            # Descriptor management
│   │   ├── __init__.py
│   │   ├── query.py            # /missing-descriptors-count, -list
│   │   └── regenerate.py       # /generate-*, /regenerate-*
│   ├── maintenance.py          # /rebuild-index
│   └── dependencies.py         # DI setup
│
└── admin/                       # Admin endpoints
    ├── __init__.py
    ├── statistics.py           # Stats endpoints
    ├── check.py                # Health checks
    ├── debug/                  # Debug tools
    │   ├── __init__.py
    │   ├── gallery.py          # /debug-gallery
    │   ├── faces.py            # /debug-photo, /debug-person
    │   └── recognition.py      # /debug-recognition
    └── helpers.py
\`\`\`

## Modular Services Structure (v5.2)

\`\`\`
services/
├── supabase/                    # Database layer (facade pattern)
│   ├── __init__.py             # SupabaseService facade
│   ├── base.py                 # Supabase client singleton
│   ├── config.py               # ConfigRepository
│   ├── embeddings.py           # EmbeddingsRepository
│   ├── faces.py                # FacesRepository
│   ├── people.py               # PeopleRepository
│   └── training.py             # TrainingRepository
│
├── training/                    # Training operations
│   ├── __init__.py             # Exports
│   ├── dataset.py              # Dataset preparation
│   ├── metrics.py              # Metrics calculation
│   ├── session.py              # Session management
│   ├── pipeline.py             # Background training
│   ├── storage.py              # HNSW index save/load
│   └── batch.py                # Batch recognition
│
├── face_recognition.py          # FaceRecognitionService (facade)
├── training_service.py          # TrainingService (thin facade)
├── insightface_model.py         # InsightFace wrapper
├── hnsw_index.py                # HNSW operations
├── quality_filters.py           # Face quality checks
└── grouping.py                  # Face clustering
\`\`\`

## Key Patterns

### 1. Dependency Injection for Modular Routers

\`\`\`python
# routers/galleries/__init__.py
supabase_db_instance: SupabaseService = None
face_service_instance: FaceRecognitionService = None

def set_services(supabase_db, face_service=None):
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service

# routers/galleries/helpers.py - GETTER FUNCTIONS (import inside!)
def get_supabase_db():
    from . import supabase_db_instance  # Import INSIDE function
    return supabase_db_instance
\`\`\`

**⚠️ Critical:** Import globals inside getter functions, not at module level!

### 2. Router Order for Parametric Routes

\`\`\`python
# Specific routes BEFORE parametric routes
router.include_router(filters_router)   # /with-unprocessed-photos
router.include_router(photos_router)    # /{id}/unprocessed-photos
router.include_router(stats_router)     # /{id}/stats
router.include_router(crud_router)      # /{identifier} - LAST!
\`\`\`

### 3. Sub-router Root Path

\`\`\`python
# Use "/" not "" for root path in sub-routers
router = APIRouter()

@router.get("/")  # Correct
async def list_items(): ...

@router.get("")   # WRONG - causes routing issues
async def list_items(): ...
\`\`\`

## Security

### AuthMiddleware (v5.1)

Централизованная защита всех write-операций:

\`\`\`python
# middleware/auth.py
class AuthMiddleware(BaseHTTPMiddleware):
    """
    Проверяет admin токен для POST/PUT/PATCH/DELETE на /api/*
    
    Правила:
    - OPTIONS: всегда разрешены (CORS preflight)
    - GET/HEAD: всегда разрешены (публичное чтение)
    - POST/PUT/PATCH/DELETE на /api/*: требуют admin token
    """
\`\`\`

## Unified API Response

Все endpoints возвращают `ApiResponse`:

\`\`\`python
from core.responses import ApiResponse

@router.get("/items/{id}")
async def get_item(id: str):
    item = await service.get(id)
    return ApiResponse.ok(item)

# Returns:
# {"success": true, "data": {...}, "error": null, "meta": null}
\`\`\`

## Exception Hierarchy

\`\`\`
AppException (base, 500)
├── NotFoundError (404)
├── ValidationError (422)
├── DatabaseError (500)
├── RecognitionError (500)
├── AuthenticationError (401)
└── TrainingError (500)
\`\`\`

## Configuration

All settings via environment variables:

\`\`\`bash
# Server
SERVER_HOST=0.0.0.0
SERVER_PORT=8001
DEBUG=false

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Recognition
DEFAULT_RECOGNITION_THRESHOLD=0.60
DEFAULT_MIN_FACE_SIZE=80

# Admin (for AuthMiddleware)
ADMIN_EMAILS=admin@example.com
\`\`\`

## Version History

- v5.2.0 - Modular routers (galleries/, images/, admin/debug/, recognition/descriptors/), training/ package refactoring
- v5.1.0 - AuthMiddleware, for_gallery optimization, On-Demand Revalidation
- v5.0.0 - All routers migrated to ApiResponse + custom exceptions
- v4.1.0 - People router modularization, Admin router
- v4.0.0 - Clean Architecture implementation
- v3.x - Modular recognition package
- v2.x - Basic face recognition
- v1.x - Initial implementation
