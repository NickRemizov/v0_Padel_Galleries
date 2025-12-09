# Database Schema - Galeries v1.1.0

Полная актуальная схема базы данных Supabase PostgreSQL (обновлено автоматически из БД).

> **Последнее обновление:** Декабрь 2024
> **Статус:** 18 таблиц, 3,191 фото

---

## Основные таблицы

### galleries
Галереи событий (турниров).

**Колонки:**
- `id` - UUID PRIMARY KEY
- `title` - TEXT (название турнира)
- `shoot_date` - DATE (дата съемки)
- `location_id` - UUID → locations(id)
- `organizer_id` - UUID → organizers(id)
- `photographer_id` - UUID → photographers(id)
- `cover_image_url` - TEXT
- `cover_image_square_url` - TEXT
- `gallery_url` - TEXT
- `external_gallery_url` - TEXT
- `sort_order` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE
- `updated_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (4 policies)
- Публичный READ доступ
- Authenticated INSERT/UPDATE/DELETE

**Пример:**
\`\`\`json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "title": "IVIN Padel Tournament",
  "shoot_date": "2024-07-27",
  "location_id": "...",
  "cover_image_url": "https://...",
  "sort_order": "date_desc"
}
\`\`\`

---

### gallery_images
Фотографии в галереях.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `gallery_id` - UUID → galleries(id) ON DELETE CASCADE
- `image_url` - TEXT (основной URL)
- `original_url` - TEXT (оригинальный URL)
- `original_filename` - TEXT (имя файла)
- `display_order` - INTEGER (порядок отображения)
- `file_size` - INTEGER (размер в байтах)
- `width` - INTEGER
- `height` - INTEGER
- `download_count` - INTEGER
- `has_been_processed` - BOOLEAN (прошло ли распознавание лиц)
- `created_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Disabled (публичный доступ)

**Ключевое поле:**
- `has_been_processed` - TRUE после успешного распознавания лиц

**Пример:**
\`\`\`json
{
  "id": "456e7890-e89b-12d3-a456-426614174000",
  "gallery_id": "123e4567-e89b-12d3-a456-426614174000",
  "original_filename": "IMG_1234.jpg",
  "image_url": "https://blob.vercel-storage.com/...",
  "has_been_processed": true,
  "width": 1920,
  "height": 1080
}
\`\`\`

---

### people
Игроки (люди на фото).

**Колонки:**
- `id` - UUID PRIMARY KEY
- `real_name` - TEXT (настоящее имя)
- `telegram_name` - TEXT (имя в Telegram)
- `telegram_nickname` - TEXT
- `telegram_profile_url` - TEXT
- `facebook_profile_url` - TEXT
- `instagram_profile_url` - TEXT
- `avatar_url` - TEXT
- `paddle_ranking` - INTEGER
- `tournament_results` - JSONB
- `show_in_players_gallery` - BOOLEAN (отображать в галерее игроков)
- `show_photos_in_galleries` - BOOLEAN (отображать фото в публичных галереях)
- `custom_confidence_threshold` - DOUBLE PRECISION
- `use_custom_confidence` - BOOLEAN
- `category` - USER-DEFINED ENUM
- `created_at` - TIMESTAMP WITH TIME ZONE
- `updated_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (4 policies)
- Публичный READ доступ
- Authenticated INSERT/UPDATE/DELETE

**Пример:**
\`\`\`json
{
  "id": "789e0123-e89b-12d3-a456-426614174000",
  "real_name": "Александр Иванов",
  "telegram_name": "Алекс",
  "instagram_profile_url": "https://instagram.com/alex_padel",
  "paddle_ranking": 1200,
  "show_in_players_gallery": true,
  "show_photos_in_galleries": true
}
\`\`\`

---

### photo_faces
**ОСНОВНАЯ ТАБЛИЦА** - Лица на фотографиях с дескрипторами.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `photo_id` - UUID → gallery_images(id) ON DELETE CASCADE
- `person_id` - UUID → people(id) ON DELETE SET NULL (NULL = неизвестное лицо)
- `bounding_box` - JSONB `{x, y, width, height}`
- `confidence` - DOUBLE PRECISION (уверенность распознавания 0-1)
- `verified` - BOOLEAN (ручная верификация)
- `verified_at` - TIMESTAMP WITH TIME ZONE
- `verified_by` - UUID → users(id)
- `insightface_descriptor` - VECTOR(512) (InsightFace embedding)
- `insightface_confidence` - DOUBLE PRECISION
- `insightface_bbox` - JSONB
- `insightface_det_score` - DOUBLE PRECISION (уверенность детекции)
- `blur_score` - DOUBLE PRECISION (резкость, больше = четче)
- `recognition_confidence` - DOUBLE PRECISION
- `training_used` - BOOLEAN (использовано ли для обучения)
- `training_context` - JSONB
- `face_category` - USER-DEFINED ENUM
- `created_at` - TIMESTAMP WITH TIME ZONE
- `updated_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (4 policies)
- Публичный READ доступ
- Authenticated INSERT/UPDATE/DELETE

**Ключевые поля:**
- `insightface_descriptor` - 512-мерный вектор лица (используется для similarity search)
- `verified` - TRUE = человек точно идентифицирован вручную
- `person_id IS NULL` - неизвестное лицо, требует идентификации

**Пример:**
\`\`\`json
{
  "id": "abc12345-e89b-12d3-a456-426614174000",
  "photo_id": "456e7890-e89b-12d3-a456-426614174000",
  "person_id": "789e0123-e89b-12d3-a456-426614174000",
  "bounding_box": {"x": 100, "y": 200, "width": 150, "height": 180},
  "confidence": 0.87,
  "verified": true,
  "insightface_det_score": 0.95,
  "blur_score": 123.45,
  "training_used": true
}
\`\`\`

---

### face_descriptors
**LEGACY ТАБЛИЦА** - Старая таблица дескрипторов (почти не используется).

**Колонки:**
- `id` - UUID PRIMARY KEY
- `person_id` - UUID → people(id)
- `descriptor` - JSONB
- `source_image_id` - UUID
- `created_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (4 policies)

**Статус:** Используется в 2 местах (cleanup при удалении person). Основная таблица - `photo_faces`.

---

### users
Пользователи (Telegram OAuth).

**Колонки:**
- `id` - UUID PRIMARY KEY
- `telegram_id` - BIGINT (уникальный ID из Telegram)
- `username` - TEXT
- `first_name` - TEXT
- `last_name` - TEXT
- `photo_url` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE
- `updated_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Disabled

---

## Дополнительные таблицы

### comments
Комментарии к фотографиям.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `user_id` - UUID → users(id)
- `gallery_image_id` - UUID → gallery_images(id)
- `content` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE
- `updated_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (4 policies)

---

### likes
Лайки фотографий.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `user_id` - UUID → users(id)
- `image_id` - UUID → gallery_images(id)
- `created_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (3 policies)

---

### favorites
Избранное пользователей.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `user_id` - UUID → users(id)
- `gallery_image_id` - UUID → gallery_images(id)
- `created_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (3 policies)

---

### locations
Локации (места проведения).

**Колонки:**
- `id` - UUID PRIMARY KEY
- `name` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (4 policies)

---

### organizers
Организаторы турниров.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `name` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (4 policies)

---

### photographers
Фотографы.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `name` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (4 policies)

---

## ML / AI таблицы

### face_training_sessions
История обучения моделей распознавания.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `status` - TEXT (pending, running, completed, failed)
- `training_mode` - TEXT
- `people_count` - INTEGER
- `faces_count` - INTEGER
- `model_version` - TEXT
- `min_faces_per_person` - INTEGER
- `context_weight` - DOUBLE PRECISION
- `metrics` - JSONB
- `error_message` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE
- `completed_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (3 policies)

---

### face_recognition_config
Настройки распознавания лиц.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `key` - TEXT
- `value` - JSONB
- `updated_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Enabled (3 policies)

**Стандартные настройки:**
\`\`\`json
{
  "quality_filters": {
    "min_face_size": 80,
    "min_blur_score": 100.0,
    "min_detection_score": 0.7
  },
  "recognition_thresholds": {
    "verified_threshold": 0.6,
    "unverified_threshold": 0.75,
    "context_weight": 0.1
  }
}
\`\`\`

---

### gallery_co_occurrence
Совместные появления людей в галереях.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `gallery_id` - UUID → galleries(id)
- `person_id_1` - UUID → people(id)
- `person_id_2` - UUID → people(id)
- `co_occurrence_count` - INTEGER
- `last_seen_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Disabled

---

### tournament_results
Результаты турниров игроков.

**Колонки:**
- `id` - UUID PRIMARY KEY
- `person_id` - UUID → people(id)
- `gallery_id` - UUID → galleries(id)
- `place` - INTEGER
- `notes` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Disabled

---

### rejected_faces
Отклоненные лица (не включаются в обучение).

**Колонки:**
- `id` - UUID PRIMARY KEY
- `photo_id` - UUID → gallery_images(id)
- `gallery_id` - UUID → galleries(id)
- `descriptor` - VECTOR
- `reason` - TEXT
- `rejected_by` - UUID → users(id)
- `rejected_at` - TIMESTAMP WITH TIME ZONE

**RLS:** Disabled

---

## Полезные запросы

### 1. Получить все фото галереи с информацией о верификации

\`\`\`sql
WITH photo_face_counts AS (
  SELECT 
    gi.id AS photo_id,
    gi.original_filename,
    gi.image_url,
    COUNT(pf.id) AS total_faces,
    COUNT(CASE WHEN pf.verified = true AND pf.person_id IS NOT NULL THEN 1 END) AS verified_faces
  FROM gallery_images gi
  LEFT JOIN photo_faces pf ON pf.photo_id = gi.id
  WHERE gi.gallery_id = 'your-gallery-id'
  GROUP BY gi.id
)
SELECT 
  *,
  CASE 
    WHEN total_faces > 0 AND verified_faces = total_faces THEN true
    ELSE false
  END AS is_fully_verified
FROM photo_face_counts
ORDER BY original_filename;
\`\`\`

### 2. Получить все фото игрока (только верифицированные)

\`\`\`sql
SELECT DISTINCT
    gi.id,
    gi.image_url,
    gi.original_filename,
    g.title AS gallery_title,
    g.shoot_date,
    pf.confidence,
    pf.verified
FROM photo_faces pf
JOIN gallery_images gi ON pf.photo_id = gi.id
JOIN galleries g ON gi.gallery_id = g.id
WHERE pf.person_id = 'your-person-id'
  AND pf.verified = true
ORDER BY g.shoot_date DESC;
\`\`\`

### 3. Найти неизвестные лица в галерее

\`\`\`sql
SELECT 
    pf.id,
    pf.bounding_box,
    pf.confidence,
    pf.insightface_det_score,
    gi.image_url,
    gi.original_filename
FROM photo_faces pf
JOIN gallery_images gi ON pf.photo_id = gi.id
WHERE gi.gallery_id = 'your-gallery-id'
  AND pf.person_id IS NULL
  AND pf.verified = false
ORDER BY pf.confidence DESC;
\`\`\`

### 4. Статистика галереи

\`\`\`sql
SELECT 
    g.id,
    g.title,
    COUNT(DISTINCT gi.id) AS total_photos,
    COUNT(DISTINCT pf.id) AS total_faces,
    COUNT(DISTINCT pf.person_id) AS unique_players,
    COUNT(CASE WHEN gi.has_been_processed = false THEN 1 END) AS unprocessed_photos,
    COUNT(DISTINCT CASE 
      WHEN pf.verified = true AND pf.person_id IS NOT NULL 
      THEN gi.id 
    END) AS photos_with_verified_faces
FROM galleries g
LEFT JOIN gallery_images gi ON g.id = gi.gallery_id
LEFT JOIN photo_faces pf ON gi.id = pf.photo_id
WHERE g.id = 'your-gallery-id'
GROUP BY g.id;
\`\`\`

### 5. Топ игроков по количеству фото

\`\`\`sql
SELECT 
    p.id,
    p.real_name,
    p.telegram_name,
    COUNT(DISTINCT pf.photo_id) AS photo_count,
    COUNT(DISTINCT gi.gallery_id) AS gallery_count
FROM people p
JOIN photo_faces pf ON p.id = pf.person_id
JOIN gallery_images gi ON pf.photo_id = gi.id
WHERE pf.verified = true
GROUP BY p.id
ORDER BY photo_count DESC
LIMIT 20;
\`\`\`

---

## Размеры таблиц (Production)

По данным на декабрь 2024:

| Таблица | Записей (примерно) | Размер |
|---------|-------------------|--------|
| `gallery_images` | 3,191 | Самая большая |
| `photo_faces` | ~10,000+ | Большая (с векторами) |
| `galleries` | 25 | Маленькая |
| `people` | ~100+ | Средняя |
| `face_descriptors` | Legacy | Маленькая |

---

## Foreign Keys

### Основные связи:

1. **galleries**
   - `location_id` → `locations(id)`
   - `organizer_id` → `organizers(id)`
   - `photographer_id` → `photographers(id)`

2. **gallery_images**
   - `gallery_id` → `galleries(id)` ON DELETE CASCADE

3. **photo_faces**
   - `photo_id` → `gallery_images(id)` ON DELETE CASCADE
   - `person_id` → `people(id)` ON DELETE SET NULL
   - `verified_by` → `users(id)`

4. **comments, likes, favorites**
   - `user_id` → `users(id)`
   - `gallery_image_id` → `gallery_images(id)`

---

## Индексы

Основные индексы для производительности:

\`\`\`sql
-- Поиск по галереям
CREATE INDEX idx_gallery_images_gallery_id ON gallery_images(gallery_id);
CREATE INDEX idx_photo_faces_photo_id ON photo_faces(photo_id);

-- Поиск по людям
CREATE INDEX idx_photo_faces_person_id ON photo_faces(person_id);
CREATE INDEX idx_photo_faces_verified ON photo_faces(verified);

-- Vector similarity search
CREATE INDEX idx_photo_faces_embedding ON photo_faces 
USING ivfflat (insightface_descriptor vector_cosine_ops);

-- Performance
CREATE INDEX idx_gallery_images_processed ON gallery_images(has_been_processed);
\`\`\`

---

## SQL скрипты

Все SQL скрипты для миграций и аудита находятся в `/scripts/`:

- `list-all-galleries.sql` - Список всех галерей
- `check-photo-verification-status.sql` - Проверка статуса верификации
- `find-problematic-photos.sql` - Поиск фото с проблемами
- `gallery-verification-report.sql` - Детальный отчет по галереям
- `export-database-schema.sql` - Экспорт полной схемы БД

**Запуск через v0:**
Используй команду: "запусти скрипт <название>.sql"
