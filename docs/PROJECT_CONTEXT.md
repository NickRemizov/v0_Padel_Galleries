# VLC Padel Photo Portal — Project Context

> **Последнее обновление:** 10 января 2026
> **Версия:** 6.1 (All-Faces-Indexed Architecture)

---

## Что это

Веб-портал для фотографий с падель-турниров с AI-распознаванием лиц.

**Основные возможности:**
- Галереи фото по турнирам
- AI-распознавание игроков (InsightFace + HNSW)
- Личные страницы игроков с их фото
- Социальные функции (лайки, комментарии, избранное)
- Админ-панель для управления

---

## Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js 15    │────▶│   FastAPI       │────▶│   Supabase      │
│   (Vercel)      │     │   (Hetzner VPS) │     │   (PostgreSQL)  │
│   vlcpadel.com  │     │   :8001         │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │   MinIO         │
                        │   (Hetzner VPS) │
                        │   :9200         │
                        └─────────────────┘
```

**Frontend:** Next.js 15, React, TypeScript, Tailwind, shadcn/ui
**Backend:** FastAPI, Python 3.11, InsightFace, hnswlib
**Database:** PostgreSQL (Supabase)
**Storage:** MinIO (фото), Supabase Storage (аватары)

---

## Авторизация

### Пользователи
```
Telegram Widget → POST /api/auth/telegram (FastAPI) → telegram_user cookie
```

### Админы
```
Google OAuth → FastAPI callback → admin_token cookie
```

### Данные
```
Next.js → apiFetch() → FastAPI → Supabase
```

Все данные идут через FastAPI. Прямой Supabase остался только для:
- Admin integrity actions (низкий приоритет)
- Activity logging

---

## Структура проекта

### Frontend (корень репозитория)
```
├── app/                    # Next.js App Router
│   ├── admin/             # Админ-панель
│   ├── gallery/           # Публичные галереи
│   ├── players/           # Страницы игроков
│   ├── my-photos/         # Мои фотографии
│   ├── favorites/         # Избранное
│   └── settings/          # Настройки профиля
├── components/
│   ├── admin/             # Админ-компоненты (модульные)
│   └── ui/                # shadcn/ui компоненты
├── lib/                   # Утилиты, типы, API клиенты
└── docs/                  # Документация
```

### Backend (python/)
```
python/
├── main.py                # Entry point
├── core/                  # Exceptions, logging, responses
├── middleware/            # Auth middleware
├── routers/
│   ├── auth/             # Telegram auth
│   ├── user/             # User API (profile, social, photos)
│   ├── people/           # Players CRUD
│   ├── faces/            # Face operations
│   ├── recognition/      # ML recognition
│   ├── galleries.py
│   └── images.py
└── services/
    ├── face_recognition.py
    ├── hnsw_index.py
    └── infrastructure/
```

---

## Ключевые концепции

### Face Recognition Pipeline
1. **Detect** — InsightFace находит лица на фото
2. **Embed** — Генерирует 512-мерный вектор (embedding)
3. **Search** — HNSW индекс ищет похожие embeddings
4. **Match** — Если similarity > threshold (0.60), назначает person_id

### Verified vs Unverified
- **verified=true** — Человек подтвердил привязку вручную
- **verified=false** — AI распознал автоматически

### HNSW Index (v6.0+)
- **ВСЕ лица с дескрипторами** попадают в индекс (включая без person_id)
- Изменение person_id **НЕ требует rebuild** индекса — используется `update_metadata()`
- `excluded_from_index=true` — лицо в индексе, но пропускается при распознавании
- При распознавании: лица без person_id или excluded игнорируются автоматически

---

## Деплой

**Frontend:** Автодеплой через Vercel при push в main

**Backend:**
```bash
/home/nickr/scripts/run.sh      # Рестарт FastAPI
/home/nickr/scripts/run-next.sh # Рестарт Next.js
/home/nickr/scripts/commit.sh "message"  # Git add + commit + push
```

---

## Документация

| Файл | Содержание |
|------|------------|
| `docs/SUPABASE_AUDIT.md` | Статус миграции Supabase → FastAPI |
| `docs/PROJECT_CONTEXT.md` | Этот файл |
| `python/ARCHITECTURE.md` | Архитектура backend |
| `python/DEPLOYMENT.md` | Инструкции деплоя |
