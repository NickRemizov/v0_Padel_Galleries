# Backend Architecture v4.0

## Overview

Чистая архитектура с разделением ответственности:

```
python/
├── main.py                      # Entry point, DI, exception handlers
├── core/                        # Foundation (no dependencies)
│   ├── config.py               # Settings from env vars
│   ├── exceptions.py           # Custom exception hierarchy
│   ├── responses.py            # Unified ApiResponse format
│   └── logging.py              # Centralized logging
├── infrastructure/              # External systems
│   ├── supabase.py             # Unified DB client
│   └── storage.py              # Photo cache, image utils
├── models/                      # Data structures
│   ├── domain/                 # Core business entities
│   │   ├── face.py             # Face, BoundingBox, FaceQuality
│   │   ├── person.py           # Person, PersonSummary
│   │   ├── gallery.py          # Gallery, GalleryImage
│   │   └── training.py         # TrainingSession, TrainingConfig
│   ├── requests/               # API input DTOs
│   └── responses/              # API output DTOs
├── repositories/                # Data access layer
│   ├── base.py                 # BaseRepository with CRUD
│   ├── faces_repo.py           # photo_faces table
│   ├── people_repo.py          # people table
│   ├── galleries_repo.py       # galleries + gallery_images
│   ├── config_repo.py          # face_recognition_config
│   └── training_repo.py        # face_training_sessions
├── services/                    # Business logic (existing)
└── routers/                     # HTTP endpoints (existing)
```

## Key Concepts

### 1. Unified API Response

Все endpoints должны возвращать `ApiResponse`:

```python
from core.responses import ApiResponse

@router.get("/items/{id}")
async def get_item(id: str):
    item = await service.get(id)
    return ApiResponse.ok(item)

# Returns:
# {"success": true, "data": {...}, "error": null, "meta": null}
```

### 2. Custom Exceptions

Исключения автоматически преобразуются в HTTP ответы:

```python
from core.exceptions import NotFoundError, ValidationError

# Raises 404
raise NotFoundError("Person", person_id)

# Raises 422
raise ValidationError("Invalid image format", field="image")

# Returns:
# {"success": false, "error": {"code": "NOT_FOUND", "message": "..."}}
```

### 3. Repository Pattern

Все DB запросы через репозитории:

```python
from repositories import FacesRepository

class FaceService:
    def __init__(self, faces_repo: FacesRepository):
        self.faces_repo = faces_repo
    
    async def get_by_photo(self, photo_id: str):
        return await self.faces_repo.get_by_photo(photo_id)
```

### 4. Domain Models

Типизированные модели вместо Dict:

```python
from models.domain import Face, BoundingBox

face = Face(
    id="123",
    photo_id="456",
    bbox=BoundingBox(x=10, y=20, width=100, height=100),
    verified=True
)
```

## Exception Hierarchy

```
AppException (base)
├── NotFoundError (404)
│   ├── PersonNotFoundError
│   ├── FaceNotFoundError
│   ├── GalleryNotFoundError
│   └── PhotoNotFoundError
├── ValidationError (422)
│   ├── InvalidImageError
│   └── InvalidBoundingBoxError
├── DatabaseError (500)
├── RecognitionError (500)
│   ├── ModelNotInitializedError
│   ├── NoFacesDetectedError
│   └── IndexNotLoadedError
├── AuthenticationError (401)
└── TrainingError (500)
```

## Migration Guide

### Adding ApiResponse to existing endpoint

```python
# Before:
@router.get("/faces/{id}")
async def get_face(id: str):
    face = await db.get_face(id)
    if not face:
        raise HTTPException(404, "Not found")
    return face

# After:
from core.responses import ApiResponse
from core.exceptions import FaceNotFoundError

@router.get("/faces/{id}")
async def get_face(id: str):
    face = await faces_repo.get_by_id(id)
    if not face:
        raise FaceNotFoundError(id)
    return ApiResponse.ok(face.model_dump())
```

### Using Repository instead of direct queries

```python
# Before:
response = supabase.table("photo_faces").select("*").eq("photo_id", photo_id).execute()
faces = response.data

# After:
faces = await faces_repo.get_by_photo(photo_id)
```

## Configuration

Все настройки через environment variables:

```bash
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
```

## Logging

```python
from core.logging import get_logger

logger = get_logger(__name__)
logger.info("Processing photo", extra={"photo_id": photo_id})
logger.error("Failed to detect faces", exc_info=True)
```
