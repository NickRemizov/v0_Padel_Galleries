# Backend Architecture v4.0

## Overview

Clean Architecture с разделением ответственности:

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
│   ├── requests/               # API input DTOs
│   └── responses/              # API output DTOs
├── repositories/                # Data access layer
├── services/                    # Business logic
└── routers/                     # HTTP endpoints
```

## Key Principles

### 1. Unified API Response

Все endpoints возвращают `ApiResponse`:

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
from core.exceptions import NotFoundError, ValidationError, DatabaseError

# 404
raise NotFoundError("Person", person_id)

# 422
raise ValidationError("Invalid image format", field="image")

# 500
raise DatabaseError("Connection failed", operation="save")
```

### 3. Centralized Logging

```python
from core.logging import get_logger

logger = get_logger(__name__)
logger.info("Processing photo")
logger.error("Failed", exc_info=True)
```

## Exception Hierarchy

```
AppException (base, 500)
├── NotFoundError (404)
├── ValidationError (422)
├── DatabaseError (500)
├── RecognitionError (500)
├── AuthenticationError (401)
└── TrainingError (500)
```

## Configuration

All settings via environment variables:

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

## Response Format

All API responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": null
}
```

Error response:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Person with id 'abc' not found",
    "details": null
  },
  "meta": null
}
```

## Migration Guide

### Adding ApiResponse to endpoint

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
from core.exceptions import NotFoundError

@router.get("/faces/{id}")
async def get_face(id: str):
    face = await db.get_face(id)
    if not face:
        raise NotFoundError("Face", id)
    return ApiResponse.ok(face)
```

## Version History

- v4.0.0 - Clean Architecture implementation
- v3.x - Modular recognition package
- v2.x - Basic face recognition
- v1.x - Initial implementation
