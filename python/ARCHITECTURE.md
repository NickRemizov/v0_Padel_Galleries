# Backend Architecture v5.1

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
├── services/                    # Business logic
└── routers/                     # HTTP endpoints
    ├── people/                 # Modular router (CRUD, photos, etc.)
    ├── galleries.py
    └── ...
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
    - Публичные пути: /, /api/health, /api/docs, /api/redoc, /api/openapi.json
    """
\`\`\`

**Frontend интеграция:**
\`\`\`typescript
// Все action файлы используют getAuthHeaders()
async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { "Authorization": `Bearer ${session.access_token}` }
  }
  return {}
}
\`\`\`

**Тестирование:**
\`\`\`bash
# POST без токена → 401
curl -X POST http://vlcpadel.com:8001/api/people \
  -H "Content-Type: application/json" \
  -d '{"real_name": "Test"}'

# GET без токена → 200 (работает)
curl http://vlcpadel.com:8001/api/people/
\`\`\`

## Key Principles

### 1. Unified API Response

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

### 2. Custom Exceptions

Исключения автоматически преобразуются в HTTP ответы:

\`\`\`python
from core.exceptions import NotFoundError, ValidationError, DatabaseError

# 404
raise NotFoundError("Person", person_id)

# 422
raise ValidationError("Invalid image format", field="image")

# 500
raise DatabaseError("Connection failed", operation="save")
\`\`\`

### 3. Centralized Logging

\`\`\`python
from core.logging import get_logger

logger = get_logger(__name__)
logger.info("Processing photo")
logger.error("Failed", exc_info=True)
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

## API Optimizations

### Players Gallery (v5.1)

Параметр `for_gallery=true` возвращает оптимизированные данные:

\`\`\`bash
GET /api/people?for_gallery=true
\`\`\`

Возвращает:
- `photo_count` — количество фото игрока
- `most_recent_gallery_date` — дата последней галереи

**Производительность:**
- До: 101 HTTP запрос, 5+ секунд
- После: 1 запрос, ~50ms

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
ADMIN_EMAILS=admin@example.com,admin2@example.com
\`\`\`

## Response Format

All API responses follow this structure:

\`\`\`json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": null
}
\`\`\`

Error response:

\`\`\`json
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
\`\`\`

## Version History

- v5.1.0 - AuthMiddleware, for_gallery optimization, On-Demand Revalidation
- v5.0.0 - All routers migrated to ApiResponse + custom exceptions
- v4.1.0 - People router modularization, Admin router
- v4.0.0 - Clean Architecture implementation
- v3.x - Modular recognition package
- v2.x - Basic face recognition
- v1.x - Initial implementation
