# PROJECT FLOW — Потоки данных Padel Galleries

> **Обновлено:** 20 декабря 2025
> **Полная схема БД:** `docs/DATABASE_SCHEMA.md`

Полная документация по потокам данных в системе распознавания лиц для фотогалерей.

## Архитектура системы

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                         ПОЛЬЗОВАТЕЛЬ                            │
└─────────────────────────────────────────────────────────────────┘
                               ↓
        ┌──────────────────────┼──────────────────────┐
        ↓                      ↓                      ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  ПУБЛИЧНЫЕ   │    │    АДМИН-    │    │  TELEGRAM    │
│  ГАЛЕРЕИ     │    │    ПАНЕЛЬ    │    │     БОТ      │
│ (Next.js)    │    │  (Next.js)   │    │   (Webhook)  │
└──────────────┘    └──────────────┘    └──────────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               ↓
        ┌──────────────────────┼──────────────────────┐
        ↓                      ↓                      ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   SUPABASE   │    │ VERCEL BLOB  │    │   FastAPI    │
│ PostgreSQL   │    │   STORAGE    │    │   BACKEND    │
│   (данные)   │    │   (фото)     │    │ (распознавание)
└──────────────┘    └──────────────┘    └──────────────┘
\`\`\`

## 1. ЗАГРУЗКА ФОТО

### Процесс
\`\`\`
Админ открывает галерею
    ↓
Загружает фото (drag & drop / кнопка)
    ↓
uploadAction() в app/admin/actions.ts
    ↓
Vercel Blob Storage
    │
    ├─ Сохранение изображения
    └─ Получение blob_url
    ↓
Supabase: gallery_images
    │
    ├─ gallery_id: uuid
    ├─ filename: text
    ├─ blob_url: text
    └─ has_been_processed: FALSE
    ↓
UI показывает фото БЕЗ БЕЙДЖА (новое)
\`\`\`

### Файлы
- `app/admin/actions.ts` → `uploadAction()`
- `components/admin/gallery-images-manager.tsx` → Upload UI

## 2. РАСПОЗНАВАНИЕ ЛИЦ

### Процесс автоматического распознавания
\`\`\`
Админ нажимает "Распознать фото"
    ↓
AutoRecognitionDialog открывается
    ↓
Для каждого фото (has_been_processed = false):
    │
    ├─ ДЕТЕКЦИЯ ЛИЦ
    │   │
    │   ├─ Next.js API: /api/face-detection/detect
    │   │       ↓
    │   │   FastAPI: POST /detect-faces
    │   │       ↓
    │   │   InsightFace детекция:
    │   │       • app.get(image) → находит лица
    │   │       • Для каждого лица:
    │   │           ├─ insightface_bbox (координаты)
    │   │           ├─ insightface_confidence (уверенность детекции)
    │   │           ├─ blur_score (резкость, Laplacian)
    │   │           ├─ face_size (ширина bbox)
    │   │           └─ insightface_descriptor (512-мерный вектор)
    │   │       ↓
    │   │   Фильтрация (если apply_quality_filters=true):
    │   │       Загрузка настроек из face_recognition_config:
    │   │           • min_face_size (default: 80px)
    │   │           • min_blur_score (default: 100.0)
    │   │           • min_detection_score (default: 0.7)
    │   │       ↓
    │   │       Отбрасывание лиц:
    │   │           ✗ face_size < min_face_size
    │   │           ✗ blur_score < min_blur_score
    │   │           ✗ insightface_confidence < min_detection_score
    │   │       ↓
    │   │   Сохранение в БД:
    │   │       photo_faces {
    │   │           photo_id: uuid (FK → gallery_images)
    │   │           person_id: NULL
    │   │           insightface_descriptor: vector(512)
    │   │           insightface_bbox: jsonb
    │   │           insightface_confidence: float
    │   │           blur_score: float
    │   │           verified: false
    │   │       }
    │   │       ↓
    │   │   gallery_images.has_been_processed = TRUE
    │
    └─ РАСПОЗНАВАНИЕ ЛИЦ
        │
        ├─ Next.js API: /api/face-detection/recognize
        │       ↓
        │   FastAPI: POST /recognize-face
        │       ↓
        │   Поиск похожих лиц:
        │       1. Загрузка эмбеддингов из БД
        │       2. HNSWLIB индекс (быстрый поиск)
        │       3. Порог из БД: confidence_thresholds.high_data (default: 0.6)
        │       ↓
        │   Если найдено совпадение (similarity >= порог):
        │       ├─ person_id = найденный игрок
        │       └─ recognition_confidence = similarity
        │   Если НЕ найдено:
        │       ├─ person_id = NULL (неизвестное лицо)
        │       └─ recognition_confidence = 0
        │       ↓
        │   Обновление photo_faces:
        │       UPDATE photo_faces SET
        │           person_id = ?,
        │           recognition_confidence = ?,
        │           verified = false
\`\`\`

### Результат - бейджи на фото
- **Без бейджа** - новое фото (has_been_processed = false)
- **NFD** (серый) - лица не найдены
- **XX/YY** (оранжевый) - XX неопознанных из YY лиц
- **XX%** (синий) - минимальная уверенность распознавания
- **✓** (зеленый) - все лица верифицированы

### Файлы
- `components/admin/auto-recognition-dialog.tsx` → UI автораспознавания
- `app/api/face-detection/detect/route.ts` → API детекции
- `app/api/face-detection/recognize/route.ts` → API распознавания
- `python/routers/recognition/` → FastAPI endpoints
- `python/services/face_recognition.py` → Логика InsightFace

## 3. КЛАСТЕРИЗАЦИЯ НЕИЗВЕСТНЫХ ЛИЦ

### Процесс
\`\`\`
Админ нажимает "Неизвестные лица"
    ↓
UnknownFacesReviewDialog открывается
    ↓
Next.js API: /training/cluster-unverified-faces
    ↓
FastAPI: POST /api/v2/training/cluster-unverified-faces
    ↓
Загрузка неизвестных лиц:
    SELECT * FROM photo_faces
    WHERE photo_id IN (
        SELECT id FROM gallery_images 
        WHERE gallery_id = ?
    )
    AND person_id IS NULL
    AND verified = false
    ↓
HDBSCAN кластеризация:
    • min_cluster_size = 2
    • min_samples = 1
    • metric = 'cosine'
    ↓
Группировка похожих лиц:
    Cluster 0: [лицо1, лицо2, лицо5]
    Cluster 1: [лицо3, лицо7, лицо9]
    Cluster -1: [лицо4, лицо6] (шум)
    ↓
Возврат кластеров в UI (отсортировано по размеру)
    ↓
UI показывает кластеры:
    • Сетка фото с синими рамками
    • Статистика: "Всего: X | Активных: Y"
    • Кнопки: "Создать игрока", "Выбрать игрока", "Зрители"
\`\`\`

### Файлы
- `components/admin/unknown-faces-review-dialog.tsx` → UI кластеризации
- `app/api/training/cluster-unverified-faces/route.ts` → API кластеризации
- `python/routers/training.py` → FastAPI endpoint
- `python/services/training_service.py` → Логика HDBSCAN

## 4. СОЗДАНИЕ/НАЗНАЧЕНИЕ ИГРОКА

### Вариант A: Создать нового игрока
\`\`\`
Админ нажимает "Создать игрока"
    ↓
AddPersonDialog открывается
    ↓
Заполнение формы:
    • Имя, Фамилия
    • Telegram username
    • Instagram, VK
    • Рейтинг
    • Аватар (первое фото из кластера)
    ↓
createPersonAction() → Supabase
    ↓
people {
    id: uuid (НОВЫЙ)
    name: text
    telegram_id: bigint
    rating: integer
}
    ↓
Callback с person_id → assignClusterToPersonAction()
\`\`\`

### Вариант B: Выбрать существующего
\`\`\`
Админ нажимает "Выбрать игрока"
    ↓
Combobox с поиском по имени
    ↓
Выбор игрока → assignClusterToPersonAction()
\`\`\`

### Назначение кластера
\`\`\`
assignClusterToPersonAction(cluster, person_id):
    ↓
Для каждого АКТИВНОГО фото в кластере:
    ↓
    UPDATE photo_faces SET
        person_id = ?,
        recognition_confidence = 1.0,
        verified = [ЛОГИКА]
    ↓
    ЛОГИКА verified:
        IF (на фото только 1 лицо):
            verified = true
        ELSE IF (все остальные лица verified=true OR recognition_confidence=1.0):
            verified = true
        ELSE:
            verified = false
    ↓
Перестроение HNSWLIB индекса:
    • POST /rebuild-index
    • Загрузка всех verified эмбеддингов
    • Создание нового индекса в памяти
    ↓
UI обновляется → бейджи меняются
\`\`\`

### Файлы
- `components/admin/add-person-dialog.tsx` → Форма создания игрока
- `app/admin/actions.ts` → `assignClusterToPersonAction()`
- `app/api/training/rebuild-index/route.ts` → Перестроение индекса

## 5. РУЧНАЯ ВЕРИФИКАЦИЯ ФОТО

### Процесс
\`\`\`
Админ кликает на фото
    ↓
FaceTaggingDialog открывается
    ↓
Проверка: есть ли уже лица в БД?
    │
    ├─ ДА: Показать существующие теги
    │       ↓
    │       Кнопка "Распознать заново без настроек"
    │           ↓
    │           Удалить все photo_faces для этого фото
    │           ↓
    │           /detect-faces с apply_quality_filters=false
    │           ↓
    │           Детальное окно с метриками:
    │               • Размер лица: XX px
    │               • Blur score: XX.X
    │               • Detection score: 0.XX
    │               • Качество эмбеддинга: XX.X
    │               • Distance to nearest: 0.XX
    │               • Top-3 похожих лиц
    │
    └─ НЕТ: Автоматически запустить распознавание
            ↓
            /detect-faces + /recognize-face
            ↓
UI показывает все лица на фото:
    • Фото с синими рамками
    • Combobox для каждого лица
    • Поиск игрока по имени
    ↓
Админ выбирает игрока для каждого лица
    ↓
Кнопка "Сохранить" активна (когда все назначены)
    ↓
saveFaceTagsAction():
    UPDATE photo_faces SET
        person_id = выбранный игрок,
        recognition_confidence = 1.0,
        verified = true  (РУЧНАЯ ВЕРИФИКАЦИЯ)
    ↓
Перестроение индекса
    ↓
Бейдж фото меняется на ✓
\`\`\`

### Файлы
- `components/admin/face-tagging-dialog.tsx` → UI тегирования
- `app/admin/actions.ts` → `saveFaceTagsAction()`

## 6. ПУБЛИЧНЫЕ ГАЛЕРЕИ

### Главная страница
\`\`\`
Пользователь открывает /
    ↓
Next.js SSR: app/page.tsx
    ↓
Supabase запрос:
    SELECT galleries.*, 
           locations.name,
           COUNT(DISTINCT photo_faces.person_id) as players,
           COUNT(gallery_images.id) as photos
    FROM galleries
    WHERE galleries.published = true
    GROUP BY galleries.id
    ORDER BY event_date DESC
    ↓
Отображение карточек галерей:
    • Название, дата, локация
    • Превью (первое фото)
    • Количество игроков и фото
\`\`\`

### Галерея события
\`\`\`
Пользователь кликает на галерею → /gallery/[id]
    ↓
Next.js SSR: app/gallery/[id]/page.tsx
    ↓
Supabase запросы:
    1. Информация о галерее
    2. Список игроков (только verified)
    3. Все фото (только verified)
    ↓
Отображение:
    • Заголовок с информацией
    • Список игроков с аватарами
    • Сетка фотографий
    ↓
Клик на игрока → /players/[id]
\`\`\`

### Галерея игрока
\`\`\`
/players/[id]
    ↓
Next.js SSR: app/players/[id]/page.tsx
    ↓
Supabase запрос:
    SELECT gallery_images.*
    FROM photo_faces
    JOIN gallery_images ON photo_faces.photo_id = gallery_images.id
    WHERE photo_faces.person_id = ?
    AND (
        photo_faces.verified = true
        OR photo_faces.recognition_confidence >= 0.80
    )
    ↓
Отображение всех фото игрока
\`\`\`

### Файлы
- `app/page.tsx` → Главная страница
- `app/gallery/[id]/page.tsx` → Галерея события
- `app/players/[id]/page.tsx` → Галерея игрока

## 7. TELEGRAM БОТ

### Отправка фото игроку
\`\`\`
Админ в галерее игрока
    ↓
Нажимает "Отправить в Telegram"
    ↓
sendPhotosToTelegramAction(person_id, photo_ids)
    ↓
Telegram Bot API:
    POST https://api.telegram.org/bot{token}/sendPhoto
    {
        chat_id: person.telegram_id,
        photo: blob_url,
        caption: "Твои фото с турнира!"
    }
    ↓
Пользователь получает фото в Telegram
\`\`\`

### Webhook обработка
\`\`\`
Telegram отправляет webhook → /api/telegram/webhook
    ↓
Обработка команд:
    /start → Приветствие
    /photos → Ссылка на галереи
    ↓
Ответ пользователю
\`\`\`

### Файлы
- `app/api/telegram/webhook/route.ts` → Webhook обработчик
- `app/admin/actions.ts` → `sendPhotosToTelegramAction()`

## Ключевые настройки

### Quality Filters (из БД: face_recognition_config)
\`\`\`javascript
{
    min_face_size: 80,           // пиксели
    min_blur_score: 100.0,       // резкость (Laplacian)
    min_detection_score: 0.7     // уверенность детекции
}
\`\`\`

### Recognition Threshold (из БД: face_recognition_config)
\`\`\`javascript
{
    confidence_thresholds: {
        high_data: 0.6           // единый порог распознавания (настраивается в БД)
    }
}
\`\`\`

### Gallery Display
\`\`\`javascript
{
    min_confidence_for_gallery: 0.80  // порог для публичных галерей
}
\`\`\`

## Статусы фото (бейджи)

| Бейдж | Цвет | Условие | Значение |
|-------|------|---------|----------|
| Без бейджа | - | `has_been_processed = false` | Новое фото |
| **NFD** | серый | Нет лиц ИЛИ все отфильтрованы | No Faces Detected |
| **XX/YY** | оранжевый | Есть `person_id = NULL` | XX неопознанных из YY |
| **XX%** | синий | Все назначены, но `verified = false` | Минимальная уверенность |
| **✓** | зеленый | Все `verified = true` ИЛИ `recognition_confidence = 1.0` | Верифицировано |

## Технологии

- **Frontend**: Next.js 15, React 19, TailwindCSS, shadcn/ui
- **Backend**: FastAPI, Python 3.11
- **ML**: InsightFace (antelopev2), HNSWLIB, HDBSCAN
- **Database**: Supabase (PostgreSQL с pgvector)
- **Storage**: Vercel Blob
- **Deployment**: Vercel (frontend), Hetzner (backend)

---

**Связанные документы:**
- `docs/DATABASE_SCHEMA.md` — полная схема БД
- `docs/PROJECT_CONTEXT.md` — общий контекст проекта
- `RECOGNITION_PROCESS_DOCUMENTATION.md` — детали распознавания
