# Схема базы данных Padel Galleries

**Дата обновления:** 13.12.2025  
**Версия:** 3.0 (Мультигород)

---

## Обзор архитектуры

База данных поддерживает мультигородскую архитектуру с возможностью расширения на новые города и страны.

```
cities
  └── locations (площадки)
        └── galleries (галереи)
              └── gallery_images (фото)
                    └── photo_faces (лица на фото)
                          └── face_descriptors (векторы лиц)
                          └── people (игроки)
```

---

## Таблицы

### cities (Города)
Справочник городов для фильтрации контента.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `name` | varchar(100) | NO | Название города ("Valencia") |
| `slug` | varchar(50) | NO | URL-slug ("valencia"), UNIQUE |
| `country` | varchar(50) | YES | Страна ("Spain") |
| `is_active` | boolean | YES | Активен ли город (default: true) |
| `created_at` | timestamptz | YES | Дата создания |

**Индексы:**
- PRIMARY KEY (id)
- UNIQUE (slug)

---

### locations (Площадки)
Места проведения турниров и игр.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `name` | text | NO | Название площадки |
| `city_id` | uuid | YES | FK → cities.id |
| `created_at` | timestamptz | YES | Дата создания |

**Связи:**
- `city_id` → `cities.id`

**Индексы:**
- PRIMARY KEY (id)
- INDEX idx_locations_city (city_id)

---

### galleries (Галереи)
Галереи фотографий с турниров.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `title` | text | NO | Название галереи |
| `shoot_date` | date | NO | Дата съёмки |
| `gallery_url` | text | NO | URL галереи (slug) |
| `cover_image_url` | text | NO | URL обложки |
| `cover_image_square_url` | text | YES | URL квадратной обложки |
| `photographer_id` | uuid | YES | FK → photographers.id |
| `location_id` | uuid | YES | FK → locations.id |
| `organizer_id` | uuid | YES | FK → organizers.id |
| `sort_order` | text | YES | Порядок сортировки фото |
| `external_gallery_url` | text | YES | Внешняя ссылка на галерею |
| `created_at` | timestamptz | YES | Дата создания |
| `updated_at` | timestamptz | YES | Дата обновления |

**Связи:**
- `location_id` → `locations.id` → `cities.id` (через location)
- `photographer_id` → `photographers.id`
- `organizer_id` → `organizers.id`

**Получение города галереи:**
```sql
SELECT c.* FROM galleries g
JOIN locations l ON l.id = g.location_id
JOIN cities c ON c.id = l.city_id
WHERE g.id = 'gallery_uuid';
```

---

### gallery_images (Фотографии)
Фотографии в галереях.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `original_filename` | text | NO | Оригинальное имя файла |
| `image_url` | text | NO | URL в Vercel Blob |
| `gallery_id` | uuid | NO | FK → galleries.id |

**Связи:**
- `gallery_id` → `galleries.id`

---

### photo_faces (Лица на фото)
Обнаруженные лица на фотографиях.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `photo_id` | uuid | NO | FK → gallery_images.id |
| `person_id` | uuid | YES | FK → people.id |
| `verified` | boolean | YES | Подтверждено вручную |
| `recognition_confidence` | double precision | YES | Уверенность распознавания (0-1) |
| `confidence` | double precision | YES | Уверенность детекции (0-1) |
| `blur_score` | double precision | YES | Оценка размытия (0-1) |
| `bounding_box` | jsonb | YES | Координаты лица {x, y, width, height} |

**Связи:**
- `photo_id` → `gallery_images.id`
- `person_id` → `people.id`

**Важно:**
- `verified=true` означает ручное подтверждение, `recognition_confidence` должен быть 1.0
- `recognition_confidence >= threshold` используется для отображения (не только verified)

---

### face_descriptors (Дескрипторы лиц)
Векторные представления лиц для распознавания (512-мерные эмбеддинги).

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `source_image_id` | uuid | NO | FK → photo_faces.id |
| `person_id` | uuid | YES | FK → people.id |
| `descriptor` | jsonb | NO | 512-мерный вектор |

**Связи:**
- `source_image_id` → `photo_faces.id`
- `person_id` → `people.id`

---

### people (Игроки)
Зарегистрированные игроки.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `real_name` | text | NO | Имя игрока |

**Примечание:** Город игрока определяется через `person_city_cache`.

---

### organizers (Организаторы)
Организаторы турниров.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `name` | text | NO | Название организатора |
| `created_at` | timestamptz | YES | Дата создания |

**Связь с городами:** через `organizer_cities` (many-to-many)

---

### photographers (Фотографы)
Фотографы.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `name` | text | NO | Имя фотографа |
| `created_at` | timestamptz | YES | Дата создания |

**Связь с городами:** через `photographer_cities` (many-to-many)

---

## Связующие таблицы (Many-to-Many)

### organizer_cities
Связь организаторов с городами (организатор может работать в нескольких городах).

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `organizer_id` | uuid | NO | FK → organizers.id |
| `city_id` | uuid | NO | FK → cities.id |
| `created_at` | timestamptz | YES | Дата создания |

**PRIMARY KEY:** (organizer_id, city_id)

---

### photographer_cities
Связь фотографов с городами.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `photographer_id` | uuid | NO | FK → photographers.id |
| `city_id` | uuid | NO | FK → cities.id |
| `created_at` | timestamptz | YES | Дата создания |

**PRIMARY KEY:** (photographer_id, city_id)

---

## Кеш-таблицы

### person_city_cache
Кеш: в каких городах играл каждый игрок. Обновляется автоматически триггерами.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `person_id` | uuid | NO | FK → people.id |
| `city_id` | uuid | NO | FK → cities.id |
| `photos_count` | int | YES | Количество фото в этом городе |
| `first_photo_date` | date | YES | Дата первого фото |
| `last_photo_date` | date | YES | Дата последнего фото |
| `updated_at` | timestamptz | YES | Дата обновления |

**PRIMARY KEY:** (person_id, city_id)

**Индексы:**
- INDEX idx_person_city_cache_city (city_id)
- INDEX idx_person_city_cache_count (city_id, photos_count DESC)

**Триггеры:**
- `trg_photo_faces_insert_cache` — обновляет кеш при добавлении лица
- `trg_photo_faces_update_cache` — обновляет кеш при назначении person_id

**Цепочка определения города игрока:**
```
people → photo_faces → gallery_images → galleries → locations → cities
```

---

## ER-диаграмма связей

```
┌─────────────┐
│   cities    │
└──────┬──────┘
       │ 1:N
       ▼
┌─────────────┐     ┌─────────────────┐
│  locations  │     │ organizer_cities│◄── organizers
└──────┬──────┘     └─────────────────┘
       │ 1:N        ┌─────────────────┐
       ▼            │photographer_city│◄── photographers
┌─────────────┐     └─────────────────┘
│  galleries  │
└──────┬──────┘
       │ 1:N
       ▼
┌─────────────┐
│gallery_image│
└──────┬──────┘
       │ 1:N
       ▼
┌─────────────┐     ┌─────────────────┐
│ photo_faces │────►│ face_descriptors│
└──────┬──────┘     └─────────────────┘
       │ N:1
       ▼
┌─────────────┐     ┌─────────────────┐
│   people    │◄───►│person_city_cache│
└─────────────┘     └─────────────────┘
```

---

## Типичные запросы

### Получить всех игроков города
```sql
SELECT p.* FROM people p
JOIN person_city_cache pcc ON pcc.person_id = p.id
WHERE pcc.city_id = 'city_uuid'
ORDER BY pcc.photos_count DESC;
```

### Получить галереи города
```sql
SELECT g.* FROM galleries g
JOIN locations l ON l.id = g.location_id
WHERE l.city_id = 'city_uuid'
ORDER BY g.shoot_date DESC;
```

### Получить организаторов города
```sql
SELECT o.* FROM organizers o
JOIN organizer_cities oc ON oc.organizer_id = o.id
WHERE oc.city_id = 'city_uuid';
```

### Пересчитать кеш person_city_cache
```sql
INSERT INTO person_city_cache (person_id, city_id, photos_count, first_photo_date, last_photo_date)
SELECT 
  pf.person_id,
  l.city_id,
  COUNT(DISTINCT pf.id) as photos_count,
  MIN(g.shoot_date) as first_photo_date,
  MAX(g.shoot_date) as last_photo_date
FROM photo_faces pf
JOIN gallery_images gi ON gi.id = pf.photo_id
JOIN galleries g ON g.id = gi.gallery_id
JOIN locations l ON l.id = g.location_id
WHERE pf.person_id IS NOT NULL 
  AND pf.recognition_confidence >= 0.6
  AND l.city_id IS NOT NULL
GROUP BY pf.person_id, l.city_id
ON CONFLICT (person_id, city_id) DO UPDATE SET
  photos_count = EXCLUDED.photos_count,
  first_photo_date = EXCLUDED.first_photo_date,
  last_photo_date = EXCLUDED.last_photo_date,
  updated_at = NOW();
```

---

## Миграции

### Добавление нового города
```sql
INSERT INTO cities (name, slug, country) 
VALUES ('Madrid', 'madrid', 'Spain');
```

### Привязка площадки к городу
```sql
UPDATE locations 
SET city_id = (SELECT id FROM cities WHERE slug = 'madrid')
WHERE name = 'Club Padel Madrid';
```

### Привязка организатора к нескольким городам
```sql
INSERT INTO organizer_cities (organizer_id, city_id)
VALUES 
  ('org_uuid', (SELECT id FROM cities WHERE slug = 'valencia')),
  ('org_uuid', (SELECT id FROM cities WHERE slug = 'madrid'));
```

---

## История изменений

### v3.0 (13.12.2025) — Мультигород
- Добавлена таблица `cities`
- Добавлен `city_id` в `locations`
- Добавлены связующие таблицы `organizer_cities`, `photographer_cities`
- Добавлена кеш-таблица `person_city_cache` с триггерами
- Данные Valencia мигрированы автоматически

### v2.0
- Базовая структура с галереями, фото, лицами
- Распознавание лиц через InsightFace

### v1.0
- Начальная версия
