# Архитектура проекта Padel Galleries

> **Обновлено:** 4 января 2026
> **Версия:** 2.1

---

## 🏗️ Общая архитектура

### Целевая архитектура (к чему стремимся)

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                         Пользователь                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (Vercel)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Публичные    │  │ Админ-панель │  │ Server       │      │
│  │ страницы     │  │              │  │ Actions      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ ВСЕ запросы через FastAPI
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Hetzner)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ CRUD API     │  │ Recognition  │  │ Training     │      │
│  │ /api/*       │  │ /api/recog/* │  │ /api/train/* │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Supabase    │  │ Vercel Blob  │  │  InsightFace │
    │  PostgreSQL  │  │   Storage    │  │   + HNSWLIB  │
    └──────────────┘  └──────────────┘  └──────────────┘
\`\`\`

### ⚠️ Текущее состояние (в процессе миграции)

Сейчас ~15 файлов на фронтенде обращаются к Supabase напрямую. Это нарушает архитектуру и создаёт проблемы с:
- Единой точкой контроля
- Валидацией данных
- Логированием

**Прогресс миграции:** см. `docs/ROADMAP.md`

---

## 📁 Структура проекта

\`\`\`
v0_Padel_Galleries/
├── app/                          # Next.js App Router
│   ├── (public)/                # Публичные страницы
│   │   ├── page.tsx             # Главная
│   │   ├── gallery/[id]/        # Галерея
│   │   └── players/             # Игроки
│   ├── admin/                   # Админ-панель
│   │   ├── page.tsx             # Главная админки
│   │   └── actions/             # Server Actions ⭐
│   │       ├── galleries.ts     # CRUD галерей
│   │       ├── people.ts        # CRUD игроков
│   │       ├── cleanup.ts       # Очистка данных
│   │       └── integrity.ts     # Проверки целостности
│   └── api/                     # Next.js API Routes (proxy)
│       └── face-detection/      # Прокси к FastAPI
│
├── components/                   # React компоненты
│   ├── admin/                   # Админ-компоненты (~30 файлов)
│   └── ui/                      # shadcn/ui
│
├── lib/                         # Утилиты
│   ├── apiClient.ts             # Клиент FastAPI (apiFetch) ⭐
│   └── supabase/                # Supabase клиенты
│
├── python/                      # FastAPI Backend ⭐
│   ├── main.py                  # Entry point
│   ├── core/                    # Конфигурация, исключения
│   ├── routers/                 # API endpoints
│   │   ├── galleries.py         # /api/galleries
│   │   ├── people.py            # /api/people
│   │   ├── faces.py             # /api/faces
│   │   ├── recognition/         # /api/recognition/*
│   │   └── training.py          # /api/v2/training
│   ├── services/                # Бизнес-логика
│   │   ├── face_recognition.py  # InsightFace
│   │   ├── hnsw_index.py        # Векторный поиск
│   │   └── training_service.py  # Обучение
│   ├── repositories/            # Работа с БД
│   └── docs/                    # Backend документация
│
├── docs/                        # Документация ⭐
│   ├── PROJECT_CONTEXT.md       # Главный контекст для AI
│   ├── DATABASE_SCHEMA.md       # Схема БД
│   ├── ROADMAP.md               # План работ
│   └── ...
│
└── migrations/                  # SQL миграции
\`\`\`

---

## 🗄️ База данных

### Ключевые таблицы

\`\`\`
cities                          # Мультигородность
  └── locations                 # Площадки/клубы
        └── galleries           # Галереи событий
              └── gallery_images    # Фотографии
                    └── photo_faces # Лица + эмбеддинги ⭐
                          └── people    # Игроки
\`\`\`

### photo_faces — главная таблица распознавания

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid | PK |
| `photo_id` | uuid | FK → gallery_images |
| `person_id` | uuid | FK → people (nullable) |
| `insightface_descriptor` | vector(512) | **Эмбеддинг лица** |
| `insightface_bbox` | jsonb | Координаты лица |
| `insightface_det_score` | float | Уверенность детекции |
| `recognition_confidence` | float | Уверенность распознавания |
| `verified` | boolean | Подтверждено вручную |
| `blur_score` | float | Резкость |

**Полная схема:** `docs/DATABASE_SCHEMA.md`

---

## 🔄 Ключевые потоки данных

### 1. Загрузка фото

\`\`\`
Админ → Drag&Drop → uploadAction() → Vercel Blob → URL в gallery_images
\`\`\`

### 2. Распознавание лиц

\`\`\`
Кнопка "Распознать" 
    → /api/face-detection/detect (Next.js proxy)
    → FastAPI /detect-faces
    → InsightFace детекция
    → Фильтрация (size, blur, confidence)
    → Сохранение в photo_faces + insightface_descriptor
\`\`\`

### 3. Поиск похожих лиц

\`\`\`
FastAPI /recognize-face
    → Загрузка эмбеддинга
    → HNSWLIB поиск в индексе верифицированных лиц
    → Возврат person_id + confidence
\`\`\`

### 4. Кластеризация неизвестных

\`\`\`
Кнопка "Неизвестные лица"
    → FastAPI /training/cluster-unverified-faces
    → HDBSCAN группировка по similarity
    → Возврат кластеров в UI
\`\`\`

---

## 🤖 Распознавание лиц

### Стек технологий

| Компонент | Технология | Назначение |
|-----------|------------|------------|
| Детекция | InsightFace (antelopev2) | Находит лица на фото |
| Эмбеддинги | InsightFace | 512-мерные векторы |
| Поиск | HNSWLIB | Быстрый поиск похожих |
| Кластеризация | HDBSCAN | Группировка неизвестных |

### Настройки качества

| Настройка | По умолчанию | Описание |
|-----------|--------------|----------|
| `min_face_size` | 80 px | Минимальный размер лица |
| `min_blur_score` | 80 | Минимальная резкость |
| `min_detection_score` | 0.7 | Минимальная уверенность детекции |

**Где настроить:** Админка → Face Training Manager

---

## 🚀 Деплоймент

### Frontend (Vercel)

- Auto-deploy при push в main
- Preview deploys для веток
- Environment variables в Vercel Dashboard

### Backend (Hetzner)

- **URL:** http://vlcpadel.com:8001
- **Health:** `curl http://vlcpadel.com:8001/health`
- **Логи:** `tail -f /tmp/fastapi.log`
- **Рестарт:** `./python/restart.sh`

Подробнее: `python/DEPLOYMENT.md`

---

## 🔐 Безопасность

### Модель авторизации

| Метод | Доступ | Обоснование |
|-------|--------|-------------|
| GET/HEAD | 🔓 Публичный | Это публичный сайт галерей |
| POST/PUT/PATCH/DELETE | 🔒 Только админы | Требует Google OAuth |

**Публичные данные (GET):**
- Галереи, фото, игроки — открытый контент
- Телефоны/email не хранятся, только Telegram username

**Защищённые операции (POST/PUT/DELETE):**
- Создание/редактирование галерей
- Управление игроками
- Распознавание и верификация лиц

### Требования к env-переменным

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `JWT_SECRET_KEY` | ✅ Да | Сервер не запустится без неё |
| `SUPABASE_JWT_SECRET` | Нет | Для legacy Supabase сессий |
| `GOOGLE_CLIENT_ID` | ✅ Да | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | ✅ Да | Google OAuth |

**Файл:** `python/middleware/auth.py`

---

## 🔗 Связанные документы

| Документ | Описание |
|----------|----------|
| `docs/PROJECT_CONTEXT.md` | Главный контекст для AI |
| `docs/DATABASE_SCHEMA.md` | Полная схема БД |
| `docs/ROADMAP.md` | План работ |
| `docs/RECOGNITION_SUMMARY.md` | Краткое о распознавании |
| `RECOGNITION_PROCESS_DOCUMENTATION.md` | Детали распознавания |
| `python/docs/API_MIGRATION_STATUS.md` | Статус миграции API |
