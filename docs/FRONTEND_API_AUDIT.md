# Frontend API Audit — Нарушения архитектуры

> **КРИТИЧЕСКОЕ ПРАВИЛО:** Frontend → FastAPI → Supabase
> 
> Любой файл, использующий `createClient()` или `supabase.from()` напрямую — нарушение!

**Дата аудита:** 15.12.2025
**Последнее обновление:** 15.12.2025

---

## Прогресс миграции

| Категория | Было | Мигрировано | Осталось |
|-----------|------|-------------|----------|
| Admin API routes | 3 | ✅ 3 | 0 |
| Social API routes | 4 | 0 | 4 (ждёт авторизацию) |
| Admin actions | 6 | 0 | 6 |
| Other routes | 2 | 0 | 2 |

---

## Результаты аудита

### ✅ МИГРИРОВАНО (используют apiFetch → FastAPI)

| Файл | Дата | Коммит |
|------|------|--------|
| `app/api/admin/face-statistics/route.ts` | 15.12.2025 | 40b8f60 |
| `app/api/admin/debug-gallery/route.ts` | 15.12.2025 | 40b8f60 |
| `app/api/admin/check-gallery/route.ts` | 15.12.2025 | 40b8f60 |
| `app/api/images/[imageId]/people/route.ts` | ранее | — |
| `app/api/recognition/rebuild-index/route.ts` | ранее | — |
| `app/api/face-detection/detect/route.ts` | ранее | — |
| `app/api/face-detection/recognize/route.ts` | ранее | — |

### 🔴 НАРУШЕНИЯ (используют Supabase напрямую)

#### Social routes (ждут реализацию авторизации)

| Файл | Размер | Операции | Приоритет |
|------|--------|----------|-----------|
| `app/api/comments/[imageId]/route.ts` | 3KB | SELECT/INSERT comments | ⏸️ После auth |
| `app/api/likes/[imageId]/route.ts` | 3KB | SELECT/INSERT/DELETE likes | ⏸️ После auth |
| `app/api/favorites/route.ts` | 1KB | SELECT favorites | ⏸️ После auth |
| `app/api/favorites/[imageId]/route.ts` | ?KB | SELECT/INSERT/DELETE favorites | ⏸️ После auth |

#### Admin server actions (следующий приоритет)

| Файл | Размер | Операции | Нужен backend |
|------|--------|----------|---------------|
| `app/admin/actions/cleanup.ts` | 13KB | UPDATE/SELECT photo_faces, gallery_images | POST /api/admin/cleanup-* |
| `app/admin/actions/integrity.ts` | 29KB | Сложные UPDATE/DELETE/SELECT | GET/POST /api/admin/integrity |
| `app/admin/actions/debug.ts` | 10KB | SELECT для диагностики | Частично покрыт |
| `app/admin/actions/faces.ts` | 12KB | UPDATE/SELECT photo_faces | Нужен новый |
| `app/admin/actions/galleries.ts` | 6KB | SELECT/UPDATE galleries | Частично покрыт |
| `app/admin/actions/people.ts` | 12KB | SELECT/UPDATE people | Частично покрыт |

#### Other routes

| Файл | Размер | Операции | Приоритет |
|------|--------|----------|-----------|
| `app/api/downloads/[imageId]/route.ts` | 1KB | RPC increment_download_count | 🟢 Низкий |
| `app/api/batch-face-recognition/route.ts` | 1KB | SELECT gallery_images | 🟡 Средний |

### ⚪ ИСКЛЮЧЕНИЯ (допустимо)

| Файл | Причина |
|------|---------|
| `app/api/upload/route.ts` | Vercel Blob — отдельный сервис для файлов |
| `app/api/auth/*` | Авторизация — специфика Supabase Auth |
| `app/admin/actions/auth.ts` | Проверка админов |

---

## Следующие шаги

### Приоритет 1: Admin actions → FastAPI

1. **Создать backend эндпоинты:**
\`\`\`python
# python/routers/admin.py (добавить)
POST /api/admin/sync-verified
POST /api/admin/cleanup-duplicates
GET /api/admin/integrity-check
POST /api/admin/integrity-fix
\`\`\`

2. **Переписать frontend actions:**
- `app/admin/actions/cleanup.ts`
- `app/admin/actions/integrity.ts`
- `app/admin/actions/faces.ts`

### Приоритет 2: После авторизации

1. **Создать python/routers/social.py:**
\`\`\`python
GET/POST/DELETE /api/social/comments/{image_id}
GET/POST/DELETE /api/social/likes/{image_id}
GET/POST/DELETE /api/social/favorites/{image_id}
\`\`\`

2. **Переписать social routes**

---

## Оценка трудозатрат (обновлено)

| Этап | Часы | Статус |
|------|------|--------|
| ~~Backend: admin API~~ | ~~4~~ | ✅ Done |
| ~~Frontend: admin API routes~~ | ~~2~~ | ✅ Done |
| Backend: admin actions endpoints | 6-8 | ⏳ Next |
| Frontend: Admin actions | 8-10 | ⏳ |
| Backend: social endpoints | 4-6 | ⏸️ After auth |
| Frontend: social routes | 4-6 | ⏸️ After auth |
| Тестирование | 4-6 | — |
| **Итого оставшееся** | **26-36 часов** | — |

---

## Связанные документы

- `python/docs/BACKEND_TODO.md` — задача #8
- `docs/FRONTEND_TODO.md` — задача #2
- `docs/SLUG_MIGRATION.md` — миграция slug (заблокирована)
