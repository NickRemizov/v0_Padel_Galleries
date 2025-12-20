# Схема базы данных Padel Galleries

**Дата обновления:** 20.12.2025  
**Версия:** 3.7 (Excluded embeddings)

---

## ✅ LEGACY ПОЛЯ ПЕРЕИМЕНОВАНЫ

Миграция выполнена 14.12.2025. Legacy поля переименованы в `*_DEPRECATED`:

| Было | Стало | Использовать |
|------|-------|--------------|
| `face_descriptors` | `face_descriptors_DEPRECATED` | `photo_faces.insightface_descriptor` |
| `photo_faces.bounding_box` | `bounding_box_DEPRECATED` | `photo_faces.insightface_bbox` |
| `photo_faces.confidence` | `confidence_DEPRECATED` | `photo_faces.insightface_confidence` |

**Любая попытка использовать старые имена вызовет ошибку** — это защита от случайного использования.

---

## Enum типы

### person_category
Категория человека в системе.

| Значение | Описание |
|----------|----------|
| `player` | Игрок (default) |
| `photographer` | Фотограф |
| `organizer` | Организатор |
| `other` | Другое |

### face_category
Категория лица для фильтрации.

| Значение | Описание |
|----------|----------|
| `unknown` | Неизвестное лицо (default) |
| `player` | Игрок |
| `staff` | Персонал |
| `spectator` | Зритель |

---

## Обзор архитектуры

База данных поддерживает мультигородскую архитектуру с возможностью расширения на новые города и страны.

\`\`\`
cities
  └── locations (площадки)
        └── galleries (галереи)
              └── gallery_images (фото)
                    └── photo_faces (лица на фото + эмбеддинги)
                          └── people (игроки)
                                └── users (Telegram-аккаунты)
\`\`\`

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
| `address` | text | YES | Физический адрес |
| `maps_url` | text | YES | Ссылка на карты (Google Maps и т.д.) |
| `website_url` | text | YES | Сайт площадки |
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
| `slug` | varchar(255) | YES | URL-slug (🔜 планируется NOT NULL) |
| `shoot_date` | date | NO | Дата съёмки |
| `gallery_url` | text | NO | URL галереи (legacy, заменяется на slug) |
| `cover_image_url` | text | NO | URL обложки |
| `cover_image_square_url` | text | YES | URL квадратной обложки |
| `photographer_id` | uuid | YES | FK → photographers.id |
| `location_id` | uuid | YES | FK → locations.id |
| `organizer_id` | uuid | YES | FK → organizers.id |
| `sort_order` | text | YES | Порядок сортировки фото (default: 'filename') |
| `external_gallery_url` | text | YES | Внешняя ссылка на галерею |
| `created_at` | timestamptz | YES | Дата создания |
| `updated_at` | timestamptz | YES | Дата обновления |

**Связи:**
- `location_id` → `locations.id` → `cities.id` (через location)
- `photographer_id` → `photographers.id`
- `organizer_id` → `organizers.id`

**Получение города галереи:**
\`\`\`sql
SELECT c.* FROM galleries g
JOIN locations l ON l.id = g.location_id
JOIN cities c ON c.id = l.city_id
WHERE g.id = 'gallery_uuid';
\`\`\`

---

### gallery_images (Фотографии)
Фотографии в галереях.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `gallery_id` | uuid | NO | FK → galleries.id |
| `image_url` | text | NO | URL в Vercel Blob |
| `original_url` | text | NO | Оригинальный URL |
| `original_filename` | text | YES | Оригинальное имя файла |
| `file_size` | integer | YES | Размер файла в байтах |
| `width` | integer | YES | Ширина изображения |
| `height` | integer | YES | Высота изображения |
| `display_order` | integer | NO | Порядок отображения (default: 0) |
| `download_count` | integer | NO | Счётчик скачиваний (default: 0) |
| `has_been_processed` | boolean | YES | Обработано ли распознаванием (default: false) |
| `slug` | varchar(255) | YES | URL-slug фото (🔜 планируется NOT NULL) |
| `is_featured` | boolean | YES | Избранное фото для карусели (default: false) |
| `created_at` | timestamptz | YES | Дата создания |

**Связи:**
- `gallery_id` → `galleries.id`

**Индексы:**
- PRIMARY KEY (id)
- UNIQUE INDEX idx_gallery_images_slug (gallery_id, slug) WHERE slug IS NOT NULL
- INDEX idx_gallery_images_featured (gallery_id, is_featured) WHERE is_featured = true

---

### photo_faces (Лица на фото) ⭐ ГЛАВНАЯ ТАБЛИЦА ДЛЯ РАСПОЗНАВАНИЯ

Обнаруженные лица на фотографиях. **Содержит ВСЕ данные для распознавания.**

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `photo_id` | uuid | NO | FK → gallery_images.id |
| `person_id` | uuid | YES | FK → people.id |
| `verified` | boolean | YES | Подтверждено вручную (default: false) |
| `recognition_confidence` | double precision | YES | Уверенность распознавания (0-1) |
| `insightface_descriptor` | vector(512) | YES | **512-мерный эмбеддинг InsightFace** |
| `insightface_bbox` | jsonb | YES | **Координаты лица {x, y, width, height}** |
| `insightface_confidence` | double precision | YES | **Уверенность детекции InsightFace** |
| `insightface_det_score` | double precision | YES | **Оценка качества детекции InsightFace** |
| `excluded_from_index` | boolean | YES | **Исключён из HNSW индекса** (default: false) ⭐ NEW |
| `blur_score` | double precision | YES | Оценка размытия (0-1) |
| `face_category` | face_category | YES | Категория лица (default: 'unknown') |
| `verified_at` | timestamptz | YES | Дата верификации |
| `verified_by` | uuid | YES | UUID верифицировавшего пользователя |
| `training_used` | boolean | YES | Использовано в обучении (default: false) |
| `training_context` | jsonb | YES | Контекст обучения |
| `created_at` | timestamptz | YES | Дата создания |
| `updated_at` | timestamptz | YES | Дата обновления |
| `bounding_box_DEPRECATED` | jsonb | YES | ⛔ НЕ ИСПОЛЬЗОВАТЬ → `insightface_bbox` |
| `confidence_DEPRECATED` | double | YES | ⛔ НЕ ИСПОЛЬЗОВАТЬ → `insightface_confidence` |

**Связи:**
- `photo_id` → `gallery_images.id`
- `person_id` → `people.id`

**Важно:**
- `verified=true` означает ручное подтверждение, `recognition_confidence` должен быть 1.0
- `recognition_confidence >= threshold` используется для отображения (не только verified)
- **Эмбеддинги хранятся в `insightface_descriptor`** — это единственный источник!
- **`excluded_from_index=true`** — эмбеддинг исключён из HNSW индекса (outlier), но остаётся в базе

**Типичные запросы:**

\`\`\`sql
-- Получить все эмбеддинги для индекса (исключая excluded)
SELECT person_id, insightface_descriptor 
FROM photo_faces 
WHERE verified = true 
  AND insightface_descriptor IS NOT NULL 
  AND person_id IS NOT NULL
  AND (excluded_from_index IS NULL OR excluded_from_index = false);

-- Подсчитать дескрипторы для человека (включая excluded)
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE excluded_from_index = true) as excluded
FROM photo_faces 
WHERE person_id = 'xxx' 
  AND insightface_descriptor IS NOT NULL;
\`\`\`

---

### face_descriptors_DEPRECATED ⛔ НЕ ИСПОЛЬЗОВАТЬ

> **Таблица переименована 14.12.2025. Будет удалена после 01.02.2025.**
> 
> Все данные в `photo_faces.insightface_descriptor`.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `source_image_id` | uuid | YES | FK → gallery_images.id |
| `person_id` | uuid | NO | FK → people.id |
| `descriptor` | jsonb | NO | ~~512-мерный вектор~~ DEPRECATED |
| `created_at` | timestamptz | YES | Дата создания |

---

### people (Игроки)
Зарегистрированные игроки.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `real_name` | text | NO | Имя игрока |
| `slug` | varchar(255) | YES | URL-slug (🔜 планируется NOT NULL) |
| `category` | person_category | YES | Категория (default: 'player') |
| `gmail` | text | YES | **Gmail для OAuth авторизации** (формат: user@gmail.com) |
| `telegram_name` | text | YES | Имя в Telegram (отображаемое) |
| `telegram_nickname` | text | YES | **Ник в Telegram** (формат: @username), используется для ссылок |
| `telegram_profile_url` | text | YES | **URL профиля Telegram** (формат: tg://user?id=...), заполняется ботом автоматически |
| `facebook_profile_url` | text | YES | URL Facebook профиля |
| `instagram_profile_url` | text | YES | URL Instagram профиля |
| `avatar_url` | text | YES | URL аватара |
| `paddle_ranking` | numeric | YES | Уровень в падел (0-10, шаг 0.25) |
| `tournament_results` | jsonb | YES | Результаты турниров (default: '[]') |
| `show_in_players_gallery` | boolean | YES | Показывать в галерее игроков (default: true) |
| `show_photos_in_galleries` | boolean | YES | Показывать фото в галереях (default: true) |
| `custom_confidence_threshold` | double precision | YES | Индивидуальный порог уверенности |
| `use_custom_confidence` | boolean | YES | Использовать индивидуальный порог (default: false) |
| `created_at` | timestamptz | YES | Дата создания |
| `updated_at` | timestamptz | YES | Дата обновления |

**Telegram поля:**
- `telegram_name` — отображаемое имя (например "Иван Петров"), не трогаем
- `telegram_nickname` — ник для ссылок (@username → https://t.me/username)
- `telegram_profile_url` — заполняется **автоматически ботом** после авторизации игрока (формат: `tg://user?id=123456`), disabled в UI

**Примечание:** Город игрока определяется через `person_city_cache`.

**Индексы:**
- PRIMARY KEY (id)
- UNIQUE INDEX idx_people_slug (slug) WHERE slug IS NOT NULL
- INDEX idx_people_gmail (gmail) WHERE gmail IS NOT NULL

---

### organizers (Организаторы)
Организаторы турниров.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `name` | text | NO | Название организатора |
| `person_id` | uuid | YES | FK → people.id (🔜 планируется) |
| `created_at` | timestamptz | YES | Дата создания |

**Связь с городами:** через `organizer_cities` (many-to-many)
**Связь с игроком:** опциональная, если организатор также является игроком

---

### photographers (Фотографы)
Фотографы.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `name` | text | NO | Имя фотографа |
| `person_id` | uuid | YES | FK → people.id (🔜 планируется) |
| `created_at` | timestamptz | YES | Дата создания |

**Связь с городами:** через `photographer_cities` (many-to-many)
**Связь с игроком:** опциональная, если фотограф также является игроком

---

## Социальные функции

### users (Пользователи)
Пользователи, авторизованные через Telegram.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `telegram_id` | bigint | NO | ID в Telegram, UNIQUE |
| `username` | text | YES | Username в Telegram |
| `first_name` | text | YES | Имя |
| `last_name` | text | YES | Фамилия |
| `photo_url` | text | YES | URL фото профиля |
| `person_id` | uuid | YES | FK → people.id (ON DELETE SET NULL) |
| `created_at` | timestamptz | YES | Дата создания |
| `updated_at` | timestamptz | YES | Дата обновления |

**Связи:**
- `person_id` → `people.id` — связь пользователя с игроком

**Индексы:**
- PRIMARY KEY (id)
- UNIQUE (telegram_id)
- INDEX idx_users_person_id (person_id)

---

### comments (Комментарии)
Комментарии к фотографиям.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `gallery_image_id` | uuid | NO | FK → gallery_images.id |
| `user_id` | uuid | NO | FK → users.id |
| `content` | text | NO | Текст комментария (1-1000 символов) |
| `created_at` | timestamptz | YES | Дата создания |
| `updated_at` | timestamptz | YES | Дата обновления |

**Связи:**
- `gallery_image_id` → `gallery_images.id`
- `user_id` → `users.id`

**Ограничения:**
- CHECK (char_length(content) >= 1 AND char_length(content) <= 1000)

---

### likes (Лайки)
Лайки к фотографиям.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `user_id` | uuid | NO | FK → users.id |
| `image_id` | uuid | NO | FK → gallery_images.id |
| `created_at` | timestamptz | YES | Дата создания |

**Связи:**
- `user_id` → `users.id`
- `image_id` → `gallery_images.id`

---

### favorites (Избранное)
Избранные фотографии пользователей.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `user_id` | uuid | NO | FK → users.id |
| `gallery_image_id` | uuid | NO | FK → gallery_images.id |
| `created_at` | timestamptz | YES | Дата создания |

**Связи:**
- `user_id` → `users.id`
- `gallery_image_id` → `gallery_images.id`

---

## Распознавание лиц (служебные таблицы)

### face_recognition_config (Конфигурация)
Конфигурация системы распознавания лиц.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `key` | text | NO | Ключ параметра, UNIQUE |
| `value` | jsonb | NO | Значение параметра |
| `updated_at` | timestamptz | YES | Дата обновления |

---

### face_training_sessions (Сессии обучения)
История сессий обучения модели распознавания.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `created_at` | timestamptz | YES | Дата создания |
| `completed_at` | timestamptz | YES | Дата завершения |
| `model_version` | text | NO | Версия модели |
| `training_mode` | text | NO | Режим: 'full' или 'incremental' |
| `faces_count` | integer | NO | Количество лиц |
| `people_count` | integer | NO | Количество людей |
| `context_weight` | double precision | YES | Вес контекста (default: 0.1) |
| `min_faces_per_person` | integer | YES | Минимум лиц на человека (default: 3) |
| `metrics` | jsonb | YES | Метрики обучения |
| `status` | text | NO | Статус: 'running', 'completed', 'failed' |
| `error_message` | text | YES | Сообщение об ошибке |

**Ограничения:**
- CHECK (training_mode IN ('full', 'incremental'))
- CHECK (status IN ('running', 'completed', 'failed'))

---

### rejected_faces (Отклонённые лица)
Лица, отклонённые при модерации.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `descriptor` | vector(512) | NO | Эмбеддинг лица |
| `gallery_id` | uuid | YES | FK → galleries.id |
| `photo_id` | uuid | YES | ID фото (не FK) |
| `rejected_by` | uuid | YES | FK → auth.users.id |
| `rejected_at` | timestamptz | YES | Дата отклонения |
| `reason` | text | YES | Причина отклонения |

**Ограничения:**
- CHECK (vector_dims(descriptor) = 512)

---

### gallery_co_occurrence (Совместные появления)
Статистика совместных появлений людей в галереях.

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `person_id_1` | uuid | NO | FK → people.id |
| `person_id_2` | uuid | NO | FK → people.id |
| `gallery_id` | uuid | NO | FK → galleries.id |
| `co_occurrence_count` | integer | YES | Счётчик (default: 1) |
| `last_seen_at` | timestamptz | YES | Последнее появление |

**Связи:**
- `person_id_1` → `people.id`
- `person_id_2` → `people.id`
- `gallery_id` → `galleries.id`

---

### tournament_results (Результаты турниров)
Результаты турниров (отдельная таблица).

| Поле | Тип | NULL | Описание |
|------|-----|------|----------|
| `id` | uuid | NO | Первичный ключ |
| `person_id` | uuid | YES | FK → people.id |
| `gallery_id` | uuid | YES | FK → galleries.id |
| `place` | integer | NO | Занятое место |
| `notes` | text | YES | Примечания |
| `created_at` | timestamptz | YES | Дата создания |

**Связи:**
- `gallery_id` → `galleries.id`
- `person_id` → `people.id` (не задан FK в БД)

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
\`\`\`
people → photo_faces → gallery_images → galleries → locations → cities
\`\`\`

---

## Функции

### generate_unique_slug
Генерирует уникальный URL-slug с автоматическим добавлением счётчика при дубликатах.

\`\`\`sql
generate_unique_slug(
  base_text TEXT,           -- Исходный текст
  table_name TEXT,          -- Имя таблицы
  column_name TEXT,         -- Имя колонки (default: 'slug')
  exclude_id UUID           -- ID для исключения при обновлении
) RETURNS TEXT
\`\`\`

**Логика:**
1. Приводит к lowercase
2. Заменяет спецсимволы на дефисы
3. Удаляет повторяющиеся дефисы
4. Ограничивает длину до 200 символов
5. При дубликате добавляет счётчик (-2, -3, ...)

---

## ER-диаграмма связей

\`\`\`
┌─────────────┐
│   cities    │
└──────┬──────┘
       │ 1:N
       ▼
┌─────────────┐     ┌─────────────────┐
│  locations  │     │ organizer_cities│◄── organizers ─┐
└──────┬──────┘     └─────────────────┘                │
       │ 1:N        ┌─────────────────┐                │
       ▼            │photographer_city│◄── photographers│
┌─────────────┐     └─────────────────┘                │
│  galleries  │                                        │
└──────┬──────┘                                        │
       │ 1:N                                           │
       ▼                                               │
┌─────────────┐                                        │
│gallery_image│◄──── comments, likes, favorites        │
└──────┬──────┘      (via users)                       │
       │ 1:N                                           │
       ▼                                               │
┌─────────────────────────────────────┐                │
│ photo_faces (+ insightface_descriptor)              │
│ + excluded_from_index (outliers)    │                │
└──────┬──────────────────────────────┘                │
       │ N:1                                           │
       ▼                                               │
┌─────────────┐     ┌─────────────────┐                │
│   people    │◄───►│person_city_cache│◄───────────────┘
└──────┬──────┘     └─────────────────┘   (🔜 person_id)
       │ 1:N
       ▼
┌─────────────┐
│    users    │ (Telegram-аккаунты)
└─────────────┘
\`\`\`

---

## Типичные запросы

### Получить всех игроков города
\`\`\`sql
SELECT p.* FROM people p
JOIN person_city_cache pcc ON pcc.person_id = p.id
WHERE pcc.city_id = 'city_uuid'
ORDER BY pcc.photos_count DESC;
\`\`\`

### Получить галереи города
\`\`\`sql
SELECT g.* FROM galleries g
JOIN locations l ON l.id = g.location_id
WHERE l.city_id = 'city_uuid'
ORDER BY g.shoot_date DESC;
\`\`\`

### Получить организаторов города
\`\`\`sql
SELECT o.* FROM organizers o
JOIN organizer_cities oc ON oc.organizer_id = o.id
WHERE oc.city_id = 'city_uuid';
\`\`\`

### Найти галерею по slug
\`\`\`sql
SELECT * FROM galleries WHERE slug = 'turnir-valencia-13-12';
\`\`\`

### Найти игрока по slug
\`\`\`sql
SELECT * FROM people WHERE slug = 'ivan-petrov';
\`\`\`

### Найти игрока по Gmail (для OAuth)
\`\`\`sql
SELECT * FROM people WHERE gmail = 'user@gmail.com';
\`\`\`

### Найти игрока по Telegram-пользователю
\`\`\`sql
SELECT p.* FROM people p
JOIN users u ON u.person_id = p.id
WHERE u.telegram_id = 123456789;
\`\`\`

### Подсчитать excluded эмбеддинги для человека
\`\`\`sql
SELECT 
  COUNT(*) as total_descriptors,
  COUNT(*) FILTER (WHERE excluded_from_index = true) as excluded_count
FROM photo_faces 
WHERE person_id = 'person_uuid' 
  AND insightface_descriptor IS NOT NULL;
\`\`\`

### Пересчитать кеш person_city_cache
\`\`\`sql
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
\`\`\`

---

## Планируемые миграции

### 🔜 Slug миграция (Human-readable URLs)
Переход с UUID на slug в URL:
- `/players/ivan-petrov` вместо `/players/550e8400-e29b-41d4-a716-446655440000`
- `/galleries/turnir-valencia-13-12` вместо `/galleries/...uuid...`

**Скрипт миграции готов**, включает:
1. Добавление колонок slug в people, galleries, gallery_images
2. Функцию generate_unique_slug для генерации уникальных slug
3. Генерацию slug для существующих данных
4. Уникальные индексы

### 🔜 Связь организаторов/фотографов с игроками
\`\`\`sql
ALTER TABLE organizers ADD COLUMN person_id UUID REFERENCES people(id);
ALTER TABLE photographers ADD COLUMN person_id UUID REFERENCES people(id);
\`\`\`

### 🔜 Удаление DEPRECATED (после 01.02.2025)
\`\`\`sql
DROP TABLE face_descriptors_DEPRECATED;
ALTER TABLE photo_faces DROP COLUMN bounding_box_DEPRECATED;
ALTER TABLE photo_faces DROP COLUMN confidence_DEPRECATED;
\`\`\`

---

## Миграции (выполненные)

### 20.12.2025 — excluded_from_index ✅
\`\`\`sql
-- Добавлено поле для исключения outliers из HNSW индекса
ALTER TABLE photo_faces ADD COLUMN excluded_from_index BOOLEAN DEFAULT FALSE;
CREATE INDEX idx_photo_faces_excluded ON photo_faces(excluded_from_index) 
  WHERE excluded_from_index = true;
\`\`\`

### 17.12.2025 — Связь users → people ✅
\`\`\`sql
ALTER TABLE public.users 
ADD COLUMN person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
CREATE INDEX idx_users_person_id ON public.users(person_id);
\`\`\`

### 14.12.2025 — Gmail и Telegram поля ✅
\`\`\`sql
-- Файл: migrations/20241214_people_gmail_telegram.sql
ALTER TABLE people ADD COLUMN gmail TEXT;
CREATE INDEX idx_people_gmail ON people(gmail) WHERE gmail IS NOT NULL;
-- Миграция telegram_profile_url → telegram_nickname
-- telegram_profile_url очищено (будет заполняться ботом)
\`\`\`

### 14.12.2025 — Переименование legacy в DEPRECATED ✅
\`\`\`sql
-- Файл: migrations/20241214_rename_legacy_to_deprecated.sql
ALTER TABLE face_descriptors RENAME TO face_descriptors_DEPRECATED;
ALTER TABLE photo_faces RENAME COLUMN bounding_box TO bounding_box_DEPRECATED;
ALTER TABLE photo_faces RENAME COLUMN confidence TO confidence_DEPRECATED;
\`\`\`

### Добавление нового города
\`\`\`sql
INSERT INTO cities (name, slug, country) 
VALUES ('Madrid', 'madrid', 'Spain');
\`\`\`

### Привязка площадки к городу
\`\`\`sql
UPDATE locations 
SET city_id = (SELECT id FROM cities WHERE slug = 'madrid')
WHERE name = 'Club Padel Madrid';
\`\`\`

### Привязка организатора к нескольким городам
\`\`\`sql
INSERT INTO organizer_cities (organizer_id, city_id)
VALUES 
  ('org_uuid', (SELECT id FROM cities WHERE slug = 'valencia')),
  ('org_uuid', (SELECT id FROM cities WHERE slug = 'madrid'));
\`\`\`

---

## История изменений

### v3.7 (20.12.2025) — Excluded embeddings ✅
- **ДОБАВЛЕНО:** `photo_faces.excluded_from_index` — флаг исключения из HNSW индекса
- **ДОБАВЛЕН индекс:** `idx_photo_faces_excluded`
- **ОБНОВЛЕНЫ запросы:** учитывают excluded_from_index при построении индекса
- **API endpoints:** 
  - `GET /people/consistency-audit` — аудит всех игроков
  - `POST /people/audit-all-embeddings` — массовое исправление outliers
  - `POST /people/{id}/clear-outliers` — исправление outliers одного игрока
  - `GET /people/{id}/embedding-consistency` — детали по эмбеддингам игрока
  - `POST /faces/{id}/toggle-excluded` — переключение excluded для одного эмбеддинга

### v3.6 (17.12.2025) — Связь users → people ✅
- **ДОБАВЛЕНО:** `users.person_id` — FK → people.id (ON DELETE SET NULL)
- **ДОБАВЛЕНО:** Индекс `idx_users_person_id`
- **ДОБАВЛЕН запрос:** Найти игрока по Telegram-пользователю
- Обновлена ER-диаграмма

### v3.5 (17.12.2025) — Полная синхронизация со схемой БД ✅
- **ДОБАВЛЕНЫ enum типы:** `person_category`, `face_category`
- **ДОБАВЛЕНЫ таблицы:**
  - `users` — пользователи Telegram
  - `comments` — комментарии к фото
  - `likes` — лайки
  - `favorites` — избранное
  - `face_recognition_config` — конфигурация распознавания
  - `face_training_sessions` — сессии обучения
  - `rejected_faces` — отклонённые лица
  - `gallery_co_occurrence` — совместные появления
  - `tournament_results` — результаты турниров
- **ДОБАВЛЕНЫ поля в `people`:** `category`, `custom_confidence_threshold`, `use_custom_confidence`
- **ДОБАВЛЕНЫ поля в `photo_faces`:** `insightface_det_score`, `face_category`
- **ДОБАВЛЕНО поле в `gallery_images`:** `has_been_processed`
- **ИСПРАВЛЕНО:** `photo_faces.verified_by` теперь uuid (было text)
- **ИСПРАВЛЕНО:** `face_descriptors_deprecated.source_image_id` FK → gallery_images.id

### v3.4 (14.12.2025) — Gmail и Telegram поля ✅
- **ДОБАВЛЕНО:** `people.gmail` для OAuth авторизации
- **ОБНОВЛЕНО:** `people.paddle_ranking` теперь numeric (шаг 0.25)
- **ОБНОВЛЕНО:** Telegram поля документированы:
  - `telegram_name` — отображаемое имя (не трогаем)
  - `telegram_nickname` — ник @username для ссылок
  - `telegram_profile_url` — заполняется ботом (tg://user?id=...)
- **ДОБАВЛЕНО:** Индекс `idx_people_gmail`
- UI: "Рейтинг" → "Уровень в падел"

### v3.3 (14.12.2025) — Legacy renamed to DEPRECATED ✅
- **ВЫПОЛНЕНО:** `face_descriptors` → `face_descriptors_DEPRECATED`
- **ВЫПОЛНЕНО:** `photo_faces.bounding_box` → `bounding_box_DEPRECATED`
- **ВЫПОЛНЕНО:** `photo_faces.confidence` → `confidence_DEPRECATED`
- Код обновлён для совместимости с обоими именами

### v3.2 (14.12.2025) — Legacy cleanup
- Добавлено предупреждение о legacy полях
- Документировано что `face_descriptors` - DEPRECATED
- Добавлены поля `width`, `height` в `gallery_images`
- Добавлены поля профилей в `people`

### v3.1 (13.12.2025) — Расширенные площадки
- Добавлены поля в `locations`: `address`, `maps_url`, `website_url`
- Подготовлена миграция slug для человекочитаемых URL
- Документированы планируемые связи organizers/photographers → people

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
