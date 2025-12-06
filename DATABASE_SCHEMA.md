# Database Schema - Galeries v0.8.2

Полная схема базы данных Supabase PostgreSQL.

## Таблицы

### galleries
Галереи событий (турниров).

\`\`\`sql
CREATE TABLE galleries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    event_date DATE NOT NULL,
    location_id UUID REFERENCES locations(id),
    organizer_id UUID REFERENCES organizers(id),
    photographer_id UUID REFERENCES photographers(id),
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_galleries_event_date ON galleries(event_date DESC);
CREATE INDEX idx_galleries_published ON galleries(published);
\`\`\`

**Пример:**
\`\`\`json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "title": "Padel Tournament by Oleg",
  "event_date": "2025-01-15",
  "location_id": "...",
  "organizer_id": "...",
  "photographer_id": "...",
  "published": true
}
\`\`\`

---

### gallery_images
Фотографии в галереях.

\`\`\`sql
CREATE TABLE gallery_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    blob_url TEXT NOT NULL,
    has_been_processed BOOLEAN DEFAULT false,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_gallery_images_gallery_id ON gallery_images(gallery_id);
CREATE INDEX idx_gallery_images_processed ON gallery_images(has_been_processed);
\`\`\`

**Поля:**
- `has_been_processed` - ключевое поле, показывает, прошло ли фото распознавание

**Пример:**
\`\`\`json
{
  "id": "456e7890-e89b-12d3-a456-426614174000",
  "gallery_id": "123e4567-e89b-12d3-a456-426614174000",
  "filename": "IMG_1234.jpg",
  "blob_url": "https://blob.vercel-storage.com/...",
  "has_been_processed": true
}
\`\`\`

---

### people
Игроки (люди на фото).

\`\`\`sql
CREATE TABLE people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    telegram_id BIGINT UNIQUE,
    telegram_username TEXT,
    instagram TEXT,
    vk TEXT,
    rating INTEGER DEFAULT 1000,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_people_telegram_id ON people(telegram_id);
CREATE INDEX idx_people_name ON people(name);
\`\`\`

**Пример:**
\`\`\`json
{
  "id": "789e0123-e89b-12d3-a456-426614174000",
  "name": "Алекс",
  "telegram_id": 123456789,
  "telegram_username": "@alex",
  "instagram": "alex_padel",
  "rating": 1200,
  "avatar_url": "https://..."
}
\`\`\`

---

### face_descriptors
Дескрипторы лиц на фотографиях (ключевая таблица).

\`\`\`sql
CREATE TABLE face_descriptors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_image_id UUID NOT NULL REFERENCES gallery_images(id) ON DELETE CASCADE,
    person_id UUID REFERENCES people(id) ON DELETE SET NULL,
    embedding vector(512) NOT NULL,
    bbox JSONB NOT NULL,
    det_score REAL NOT NULL,
    blur_score REAL,
    verified BOOLEAN DEFAULT false,
    confidence REAL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_face_descriptors_image ON face_descriptors(gallery_image_id);
CREATE INDEX idx_face_descriptors_person ON face_descriptors(person_id);
CREATE INDEX idx_face_descriptors_verified ON face_descriptors(verified);
CREATE INDEX idx_face_descriptors_embedding ON face_descriptors USING ivfflat (embedding vector_cosine_ops);
\`\`\`

**Поля:**
- `embedding` - 512-мерный вектор лица (InsightFace)
- `bbox` - координаты лица: `{x, y, width, height}`
- `det_score` - уверенность детекции (0-1)
- `blur_score` - резкость лица (Laplacian, больше = четче)
- `verified` - ручная верификация (true = 100% уверены)
- `confidence` - уверенность автоматического распознавания (0-1)
- `person_id` - NULL если лицо неизвестно

**Пример:**
\`\`\`json
{
  "id": "abc12345-e89b-12d3-a456-426614174000",
  "gallery_image_id": "456e7890-e89b-12d3-a456-426614174000",
  "person_id": "789e0123-e89b-12d3-a456-426614174000",
  "embedding": [0.123, 0.456, ...], // 512 чисел
  "bbox": {
    "x": 100,
    "y": 200,
    "width": 150,
    "height": 180
  },
  "det_score": 0.95,
  "blur_score": 123.45,
  "verified": true,
  "confidence": 0.87
}
\`\`\`

---

### face_recognition_config
Настройки распознавания лиц.

\`\`\`sql
CREATE TABLE face_recognition_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

**Стандартные настройки:**
\`\`\`sql
INSERT INTO face_recognition_config (key, value, description) VALUES
('quality_filters', '{
  "min_face_size": 80,
  "min_blur_score": 100.0,
  "min_detection_score": 0.7
}', 'Фильтры качества для детекции лиц'),

('recognition_thresholds', '{
  "verified_threshold": 0.6,
  "unverified_threshold": 0.75,
  "context_weight": 0.1
}', 'Пороги для распознавания лиц'),

('gallery_display', '{
  "min_confidence_for_gallery": 0.80
}', 'Настройки отображения в публичных галереях');
\`\`\`

---

### locations
Локации (места проведения турниров).

\`\`\`sql
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

---

### organizers
Организаторы турниров.

\`\`\`sql
CREATE TABLE organizers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

---

### photographers
Фотографы.

\`\`\`sql
CREATE TABLE photographers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    instagram TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

---

## Запросы (Examples)

### Получить все фото галереи с информацией о лицах
\`\`\`sql
SELECT 
    gi.id,
    gi.filename,
    gi.blob_url,
    gi.has_been_processed,
    COUNT(fd.id) as total_faces,
    COUNT(CASE WHEN fd.person_id IS NULL THEN 1 END) as unidentified_faces,
    MIN(fd.confidence) as min_confidence,
    BOOL_AND(fd.verified OR fd.confidence = 1.0) as all_verified
FROM gallery_images gi
LEFT JOIN face_descriptors fd ON gi.id = fd.gallery_image_id
WHERE gi.gallery_id = 'your-gallery-id'
GROUP BY gi.id
ORDER BY gi.uploaded_at DESC;
\`\`\`

### Получить все фото игрока
\`\`\`sql
SELECT DISTINCT
    gi.id,
    gi.blob_url,
    gi.filename,
    g.title as gallery_title,
    g.event_date,
    fd.confidence,
    fd.verified
FROM face_descriptors fd
JOIN gallery_images gi ON fd.gallery_image_id = gi.id
JOIN galleries g ON gi.gallery_id = g.id
WHERE fd.person_id = 'your-person-id'
  AND (fd.verified = true OR fd.confidence >= 0.80)
ORDER BY g.event_date DESC, gi.uploaded_at DESC;
\`\`\`

### Получить неизвестные лица в галерее
\`\`\`sql
SELECT 
    fd.id,
    fd.embedding,
    fd.bbox,
    gi.blob_url,
    gi.filename
FROM face_descriptors fd
JOIN gallery_images gi ON fd.gallery_image_id = gi.id
WHERE gi.gallery_id = 'your-gallery-id'
  AND fd.person_id IS NULL
  AND fd.verified = false;
\`\`\`

### Получить статистику галереи
\`\`\`sql
SELECT 
    g.id,
    g.title,
    COUNT(DISTINCT gi.id) as total_photos,
    COUNT(DISTINCT fd.id) as total_faces,
    COUNT(DISTINCT fd.person_id) as unique_players,
    COUNT(CASE WHEN gi.has_been_processed = false THEN 1 END) as unprocessed_photos
FROM galleries g
LEFT JOIN gallery_images gi ON g.id = gi.gallery_id
LEFT JOIN face_descriptors fd ON gi.id = fd.gallery_image_id
WHERE g.id = 'your-gallery-id'
GROUP BY g.id;
\`\`\`

---

## Миграции

Все SQL скрипты находятся в директории `/scripts/`.

**Основные скрипты:**
- `001_create_tables.sql` - Создание всех таблиц
- `002_add_organizers.sql` - Добавление организаторов
- `003_add_blur_score.sql` - Добавление blur_score колонки
- И другие...

**Запуск миграций:**
Используйте интерфейс v0 для запуска SQL скриптов напрямую в Supabase.
