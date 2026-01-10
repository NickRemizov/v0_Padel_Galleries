# API Reference - Galeries v6.1

Полное описание всех API endpoints в системе.

> **v6.0 (all-faces-indexed)**: HNSW индекс содержит ВСЕ лица с дескрипторами.
> Изменение person_id не требует rebuild - используется `update_metadata()`.

## Next.js API Routes

> **Note:** Большинство операций с распознаванием теперь идут напрямую через FastAPI.
> Next.js API Routes используются для проксирования и специфичных frontend-операций.

### Faces

#### GET/POST /api/faces/[faceId]/*
Операции с конкретными лицами (детали, обновление и т.д.)

**Файл:** `app/api/faces/[faceId]/`

---

### Admin Indexing

#### POST /api/admin/training/*
Операции обучения через FastAPI proxy.

**Файл:** `app/api/admin/training/`

---

### Telegram

#### POST /api/telegram/webhook
Webhook для обработки сообщений от Telegram бота.

**Request Body:** (Telegram Update object)

**Response:**
\`\`\`typescript
{
  ok: boolean;
}
\`\`\`

**Файл:** `app/api/telegram/webhook/route.ts`

---

## FastAPI Endpoints

Base URL: `http://your-server-ip:8001` (или `FASTAPI_URL` env variable)

### Recognition

#### POST /api/recognition/detect-faces
Детекция лиц на изображении.

**Request:**
\`\`\`json
{
  "image_url": "https://blob.vercel-storage.com/...",
  "apply_quality_filters": true
}
\`\`\`

**Response:**
\`\`\`json
{
  "faces": [
    {
      "embedding": [0.123, 0.456, ...],
      "bbox": {
        "x": 100,
        "y": 200,
        "width": 150,
        "height": 180
      },
      "det_score": 0.95,
      "blur_score": 123.45,
      "face_size": 150
    }
  ]
}
\`\`\`

**Файл:** `python/routers/recognition/detect.py`

---

#### POST /api/recognition/recognize-face
Распознавание лица по эмбеддингу.

**Request:**
\`\`\`json
{
  "embedding": [0.123, 0.456, ...],
  "confidence_threshold": 0.6
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "data": {
    "person_id": "uuid",
    "confidence": 0.85
  }
}
\`\`\`

**v6.0 Note:** `confidence` = `source_confidence × similarity` (confidence chain).

**Файл:** `python/routers/recognition/recognize.py`

---

### Indexing

#### POST /api/v2/training/cluster-unverified-faces
Кластеризация неизвестных лиц.

**Request:**
\`\`\`json
{
  "gallery_id": "uuid"
}
\`\`\`

**Response:**
\`\`\`json
{
  "clusters": [
    {
      "cluster_id": 0,
      "faces": [
        {
          "face_id": "uuid",
          "image_id": "uuid",
          "image_url": "https://...",
          "bbox": {...}
        }
      ],
      "size": 5
    }
  ],
  "total_faces": 20,
  "clustered_faces": 15,
  "noise_faces": 5
}
\`\`\`

**Файл:** `python/routers/training.py`

---

#### POST /api/recognition/rebuild-index
Перестроение HNSWLIB индекса (v6.0 (all-faces-indexed)).

**Request:** (пустой)

**Response:**
\`\`\`json
{
  "success": true,
  "data": {
    "old_descriptor_count": 7500,
    "new_descriptor_count": 7871,
    "verified_count": 5200,
    "unique_people_count": 212
  }
}
\`\`\`

**v6.0 Note:** Теперь индексирует ВСЕ лица с дескрипторами, включая те, у которых person_id = NULL.

**Файл:** `python/routers/recognition/maintenance.py`

---

#### POST /api/faces/{face_id}/update-metadata (NEW in v6.0)
Обновление метаданных лица БЕЗ перестроения индекса.

**Query Parameters:**
- `person_id` (optional): Новый person_id (пустая строка = null)
- `verified` (optional): Новый статус верификации
- `confidence` (optional): Новая уверенность
- `excluded` (optional): Исключить из распознавания

**Response:**
\`\`\`json
{
  "success": true,
  "data": {
    "success": true
  }
}
\`\`\`

**Файл:** `python/services/face_recognition.py`

---

## Server Actions (Next.js)

Server Actions организованы по модулям в `app/admin/actions/`:
- `faces/` — операции с лицами (photo-processing.ts, index-operations.ts)
- `people/` — операции с игроками
- `integrity/` — проверки целостности
- `galleries.ts` — операции с галереями
- `cleanup.ts` — очистка данных

### uploadAction
Загрузка фото в галерею.

**Parameters:**
\`\`\`typescript
formData: FormData  // Содержит файлы и galleryId
\`\`\`

**Returns:**
\`\`\`typescript
{
  success: boolean;
  message: string;
  imageIds?: string[];
}
\`\`\`

---

### createPersonAction
Создание нового игрока.

**Parameters:**
\`\`\`typescript
{
  name: string;
  telegram_username?: string;
  instagram?: string;
  vk?: string;
  rating?: number;
  avatarUrl?: string;
}
\`\`\`

**Returns:**
\`\`\`typescript
{
  success: boolean;
  person?: Person;
  error?: string;
}
\`\`\`

---

### assignClusterToPersonAction
Назначение кластера лиц игроку.

**Parameters:**
\`\`\`typescript
{
  faceIds: string[];      // ID лиц из кластера
  personId: string;       // ID игрока
  galleryId: string;      // ID галереи
}
\`\`\`

**Returns:**
\`\`\`typescript
{
  success: boolean;
  message: string;
}
\`\`\`

---

### saveFaceTagsAction
Сохранение ручной разметки лиц на фото.

**Parameters:**
\`\`\`typescript
{
  imageId: string;
  tags: Array<{
    faceId: string;
    personId: string;
  }>;
}
\`\`\`

**Returns:**
\`\`\`typescript
{
  success: boolean;
  message: string;
}
\`\`\`

---

### sendPhotosToTelegramAction
Отправка фото игроку в Telegram.

**Parameters:**
\`\`\`typescript
{
  personId: string;
  photoIds: string[];
}
\`\`\`

**Returns:**
\`\`\`typescript
{
  success: boolean;
  message: string;
  sentCount: number;
}
\`\`\`

---

## Environment Variables

### Next.js (Vercel)
\`\`\`bash
# Supabase
POSTGRES_URL="postgresql://..."
SUPABASE_URL="https://..."
SUPABASE_ANON_KEY="..."
NEXT_PUBLIC_SUPABASE_URL="https://..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."

# Vercel Blob
BLOB_READ_WRITE_TOKEN="..."

# Telegram
TELEGRAM_BOT_TOKEN="..."
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="..."

# FastAPI Backend
FASTAPI_URL="http://your-server:8001"
NEXT_PUBLIC_FASTAPI_URL="http://your-server:8001"
\`\`\`

### FastAPI (Hetzner)
\`\`\`bash
# Database
POSTGRES_URL="postgresql://..."

# Server
SERVER_IP="0.0.0.0"
SERVER_PORT="8001"
SERVER_HOST="https://your-domain.com"

# JWT
JWT_SECRET_KEY="..."

# CORS
ALLOWED_ORIGINS="https://your-domain.com,http://localhost:3000"
\`\`\`

---

## Error Codes

### 400 Bad Request
- Невалидные параметры запроса
- Отсутствуют обязательные поля

### 401 Unauthorized
- Отсутствует или невалиден токен аутентификации

### 404 Not Found
- Запрошенный ресурс не найден

### 500 Internal Server Error
- Ошибка на сервере
- Проблемы с базой данных
- Ошибка ML модели

### 503 Service Unavailable
- FastAPI бэкенд недоступен
- Supabase недоступен
