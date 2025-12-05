# Архитектура проекта Galeries

## 🏗️ Общая архитектура

Проект состоит из двух основных частей:

1. **Next.js фронтенд** - веб-интерфейс и API роуты
2. **FastAPI бэкенд** - распознавание лиц и обработка изображений

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                         Пользователь                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (Vercel)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Публичные    │  │ Админ-панель │  │ API Routes   │      │
│  │ галереи      │  │              │  │ (Proxy)      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Supabase    │  │ Vercel Blob  │  │   FastAPI    │
    │  PostgreSQL  │  │   Storage    │  │   Backend    │
    │              │  │              │  │  (Hetzner)   │
    └──────────────┘  └──────────────┘  └──────────────┘
\`\`\`

## 📁 Структура директорий

\`\`\`
galeries/
├── app/                          # Next.js App Router
│   ├── [galleryId]/             # Публичные галереи (динамический роут)
│   │   └── page.tsx             # Страница галереи для пользователей
│   ├── admin/                   # Админ-панель
│   │   ├── page.tsx             # Главная страница админки
│   │   ├── login/               # Страница входа
│   │   └── auth/                # Callback для OAuth
│   ├── api/                     # API Routes (Next.js)
│   │   └── admin/               # Админ API endpoints
│   ├── layout.tsx               # Корневой layout
│   └── globals.css              # Глобальные стили
│
├── components/                   # React компоненты
│   ├── admin/                   # Компоненты админ-панели
│   │   ├── galleries-manager.tsx           # Управление галереями
│   │   ├── people-manager.tsx              # Управление людьми
│   │   ├── gallery-images-manager.tsx      # Управление фото
│   │   ├── face-tagging-dialog.tsx         # Тегирование лиц
│   │   ├── auto-recognition-dialog.tsx     # Автораспознавание
│   │   ├── unknown-faces-review-dialog.tsx # Кластеры неизвестных
│   │   ├── person-gallery-dialog.tsx       # Галерея игрока
│   │   ├── face-training-manager.tsx       # Настройки распознавания
│   │   └── database-integrity-checker.tsx  # Проверка целостности БД
│   └── ui/                      # shadcn/ui компоненты
│
├── lib/                         # Утилиты и хелперы
│   ├── auth/                    # Аутентификация
│   │   ├── client.ts            # Supabase клиент (браузер)
│   │   ├── server.ts            # Supabase клиент (сервер)
│   │   └── serverGuard.ts       # Middleware для защиты роутов
│   └── utils.ts                 # Общие утилиты
│
├── python/                      # FastAPI Backend
│   ├── main.py                  # Главный файл FastAPI
│   ├── routers/                 # API роутеры
│   │   ├── recognition.py       # Распознавание лиц
│   │   ├── training.py          # Обучение модели
│   │   └── config.py            # Конфигурация
│   ├── services/                # Бизнес-логика
│   │   ├── face_recognition.py  # Логика распознавания
│   │   ├── supabase_client.py   # Работа с БД
│   │   └── clustering.py        # Кластеризация лиц
│   ├── models/                  # Pydantic модели
│   │   └── schemas.py           # Схемы данных
│   └── requirements.txt         # Python зависимости
│
├── scripts/                     # SQL скрипты
│   ├── 001_create_tables.sql    # Создание таблиц
│   └── 002_add_organizers.sql   # Начальные данные
│
└── public/                      # Статические файлы
\`\`\`

## 🔄 Поток данных

### 1. Загрузка фотографий

\`\`\`
Админ → Upload → Vercel Blob → URL сохраняется в Supabase
                                      ↓
                              gallery_images таблица
\`\`\`

### 2. Распознавание лиц

\`\`\`
Админ → Запуск распознавания → Next.js API → FastAPI
                                                ↓
                                    InsightFace детекция
                                                ↓
                                    Извлечение эмбеддингов
                                                ↓
                                    HNSWLIB поиск похожих
                                                ↓
                                    Сохранение в Supabase
                                    (face_descriptors таблица)
\`\`\`

### 3. Кластеризация неизвестных лиц

\`\`\`
Админ → Запрос кластеров → FastAPI
                              ↓
                    Загрузка неизвестных лиц из БД
                              ↓
                    HDBSCAN кластеризация
                              ↓
                    Группировка по similarity
                              ↓
                    Возврат кластеров в UI
\`\`\`

### 4. Верификация лиц

\`\`\`
Админ → Подтверждение лица → Next.js API → Supabase
                                              ↓
                                    face_descriptors.verified = true
                                              ↓
                                    Перестройка HNSWLIB индекса
\`\`\`

## 🗄️ Схема базы данных

### Основные таблицы

**galleries** - Галереи событий
- `id` (uuid, PK)
- `title` (text)
- `event_date` (date)
- `location_id` (uuid, FK → locations)
- `organizer_id` (uuid, FK → organizers)
- `photographer_id` (uuid, FK → photographers)
- `created_at` (timestamp)

**gallery_images** - Фотографии в галереях
- `id` (uuid, PK)
- `gallery_id` (uuid, FK → galleries)
- `filename` (text)
- `blob_url` (text)
- `uploaded_at` (timestamp)

**people** - Игроки
- `id` (uuid, PK)
- `name` (text)
- `telegram_id` (bigint, unique)
- `rating` (integer)
- `instagram` (text)
- `created_at` (timestamp)

**face_descriptors** - Дескрипторы лиц
- `id` (uuid, PK)
- `gallery_image_id` (uuid, FK → gallery_images)
- `person_id` (uuid, FK → people, nullable)
- `embedding` (vector(512))
- `bbox` (jsonb) - координаты лица
- `det_score` (float) - уверенность детекции
- `verified` (boolean) - верифицировано ли лицо
- `created_at` (timestamp)

**Связи:**
- galleries → locations (many-to-one)
- galleries → organizers (many-to-one)
- galleries → photographers (many-to-one)
- gallery_images → galleries (many-to-one)
- face_descriptors → gallery_images (many-to-one)
- face_descriptors → people (many-to-one, nullable)

## 🔐 Аутентификация и авторизация

### Supabase Auth

1. **Google OAuth** - вход через Google аккаунт
2. **Session Management** - сессии хранятся в cookies
3. **Server-side Auth** - проверка на сервере через `serverGuard.ts`

### Защита роутов

**Публичные:**
- `/[galleryId]` - просмотр галерей

**Защищенные (требуют авторизации):**
- `/admin/*` - все админ роуты
- `/api/admin/*` - все админ API endpoints

### Middleware

`lib/auth/serverGuard.ts` - проверяет авторизацию на сервере:
\`\`\`typescript
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json(
      { error: 'Forbidden: Admin role required' },
      { status: 403 }
    )
  }
  
  return { user }
}
\`\`\`

## 🤖 Распознавание лиц

### Технологии

1. **InsightFace** - детекция и распознавание лиц
   - Модель: `antelopev2`
   - Размер эмбеддинга: 512 измерений

2. **HNSWLIB** - векторный поиск
   - Индекс строится из верифицированных лиц
   - Быстрый поиск похожих эмбеддингов

3. **HDBSCAN** - кластеризация
   - Группировка неизвестных лиц
   - Автоматическое определение количества кластеров

### Процесс распознавания

1. **Детекция лиц** - InsightFace находит лица на фото
2. **Извлечение эмбеддингов** - для каждого лица создается вектор 512 измерений
3. **Поиск похожих** - HNSWLIB ищет ближайшие эмбеддинги в индексе
4. **Фильтрация** - применяются пороги по качеству (det_score, blur_score, face_size)
5. **Сохранение** - результаты сохраняются в `face_descriptors`

### Настройки качества

- `min_det_score` (0.0-1.0) - минимальная уверенность детекции
- `min_face_size` (px) - минимальный размер лица
- `min_blur_score` (10-150) - минимальная резкость (выше = четче)

## 🔄 Интеграции

### Vercel Blob Storage

- Хранение оригинальных фотографий
- CDN для быстрой доставки
- Автоматическая оптимизация изображений

### Supabase

- PostgreSQL база данных
- Realtime subscriptions (не используется пока)
- Row Level Security (RLS)
- Supabase Auth для аутентификации

### Telegram Bot

- Отправка фотографий пользователям
- Webhook для получения сообщений
- Интеграция через Telegram Bot API

## 📊 Мониторинг и отладка

### Логирование

**Next.js:**
- Console logs в браузере
- Server logs в терминале

**FastAPI:**
- Uvicorn logs
- Custom logging в `main.py`

### Проверка целостности БД

Компонент `database-integrity-checker.tsx` выполняет 15 проверок:
1. Orphaned face descriptors
2. Orphaned gallery images
3. Invalid person references
4. Duplicate embeddings
5. Missing bounding boxes
6. Invalid detection scores
7. Orphaned people
8. Galleries without images
9. Images without faces
10. Duplicate filenames
11. Invalid blob URLs
12. Missing gallery metadata
13. Inconsistent verification status
14. Duplicate person names
15. Invalid telegram IDs

## 🚀 Развертывание

### Next.js (Vercel)

1. Push код в GitHub
2. Подключите репозиторий к Vercel
3. Настройте переменные окружения
4. Deploy автоматически при push

### FastAPI (Hetzner)

1. Создайте VPS на Hetzner
2. Установите Python 3.9+
3. Клонируйте репозиторий
4. Установите зависимости
5. Запустите через systemd service

См. `python/DEPLOYMENT.md` для подробных инструкций.

---

**Версия:** 0.7.8
**Последнее обновление:** 2025-01-31
\`\`\`

\`\`\`markdown file="" isHidden
