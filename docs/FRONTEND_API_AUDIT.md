# Frontend API Audit — Нарушения архитектуры

> **КРИТИЧЕСКОЕ ПРАВИЛО:** Frontend → FastAPI → Supabase
> 
> Любой файл, использующий `createClient()` или `supabase.from()` напрямую — нарушение!

**Дата аудита:** 15.12.2025

---

## Результаты аудита

### 🔴 НАРУШЕНИЯ (используют Supabase напрямую)

| Файл | Размер | Операции | Приоритет миграции |
|------|--------|----------|-------------------|
| `app/api/admin/debug-gallery/route.ts` | 8KB | SELECT galleries, gallery_images, photo_faces | 🟡 Средний |
| `app/api/admin/check-gallery/route.ts` | 4KB | SELECT galleries, gallery_images, photo_faces | 🟡 Средний |
| `app/api/admin/face-statistics/route.ts` | 17KB | SELECT people, photo_faces, gallery_images, galleries, config | 🔴 Высокий |
| `app/api/comments/[imageId]/route.ts` | 3KB | SELECT/INSERT comments | 🟡 Средний |
| `app/api/likes/[imageId]/route.ts` | 3KB | SELECT/INSERT/DELETE likes | 🟡 Средний |
| `app/api/favorites/route.ts` | 1KB | SELECT favorites | 🟡 Средний |
| `app/api/favorites/[imageId]/route.ts` | ?KB | SELECT/INSERT/DELETE favorites | 🟡 Средний |
| `app/api/downloads/[imageId]/route.ts` | 1KB | RPC increment_download_count | 🟢 Низкий |
| `app/api/auth/telegram/route.ts` | 3KB | SELECT/UPSERT users | ⚪ Исключение (auth) |
| `app/api/batch-face-recognition/route.ts` | 1KB | SELECT gallery_images | 🟡 Средний |
| `app/admin/actions/cleanup.ts` | 13KB | UPDATE/SELECT photo_faces, gallery_images | 🔴 Высокий |
| `app/admin/actions/integrity.ts` | 29KB | Сложные UPDATE/DELETE/SELECT | 🔴 Высокий |
| `app/admin/actions/debug.ts` | 10KB | SELECT для диагностики | 🟡 Средний |
| `app/admin/actions/auth.ts` | 2KB | SELECT admins | ⚪ Исключение (auth) |
| `app/admin/actions/faces.ts` | 12KB | UPDATE/SELECT photo_faces | 🔴 Высокий |
| `app/admin/actions/galleries.ts` | 6KB | SELECT/UPDATE galleries | 🟡 Средний |
| `app/admin/actions/people.ts` | 12KB | SELECT/UPDATE people | 🔴 Высокий |

**Итого нарушений: ~15 файлов, ~125KB кода**

### ✅ КОРРЕКТНЫЕ (используют apiFetch → FastAPI)

| Файл | Описание |
|------|----------|
| `app/api/images/[imageId]/people/route.ts` | Вызывает FastAPI `/api/images/{id}/people` |
| `app/api/recognition/rebuild-index/route.ts` | Вызывает FastAPI `/rebuild-index` |
| `app/api/face-detection/detect/route.ts` | Вызывает FastAPI `/api/recognition/detect-faces` |
| `app/api/face-detection/recognize/route.ts` | Вызывает FastAPI (предположительно) |

### ⚪ ИСКЛЮЧЕНИЯ (допустимо)

| Файл | Причина |
|------|---------|
| `app/api/upload/route.ts` | Vercel Blob — отдельный сервис для файлов |
| `app/api/auth/*` | Авторизация — специфика Supabase Auth |

---

## План миграции

### Этап 1: Создать недостающие FastAPI эндпоинты

```python
# python/routers/social.py (новый)
GET/POST/DELETE /api/social/comments/{image_id}
GET/POST/DELETE /api/social/likes/{image_id}
GET/POST/DELETE /api/social/favorites/{image_id}

# python/routers/admin.py (расширить или создать)
GET /api/admin/debug-gallery
GET /api/admin/check-gallery
GET /api/admin/face-statistics
POST /api/admin/sync-verified
POST /api/admin/cleanup-duplicates
GET /api/admin/integrity-check
POST /api/admin/integrity-fix
```

### Этап 2: Переписать frontend routes

Каждый файл из списка нарушений переписать на использование `apiFetch()`:

```typescript
// БЫЛО:
const supabase = await createClient()
const { data } = await supabase.from("galleries").select("*")

// СТАЛО:
import { apiFetch } from "@/lib/apiClient"
const { data } = await apiFetch("/api/galleries")
```

### Этап 3: Удалить прямой доступ к Supabase

После миграции всех файлов:
- Удалить `lib/supabase/server.ts` (или оставить только для auth)
- Убрать `SUPABASE_URL` из env фронтенда (кроме auth)

---

## Оценка трудозатрат

| Этап | Часы |
|------|------|
| Backend: social endpoints | 4-6 |
| Backend: admin endpoints | 8-12 |
| Frontend: API routes | 6-8 |
| Frontend: Admin actions | 12-16 |
| Тестирование | 6-8 |
| **Итого** | **36-50 часов** |

---

## Связанные документы

- `python/docs/BACKEND_TODO.md` — задача #8
- `docs/FRONTEND_TODO.md` — задача #2
- `docs/SLUG_MIGRATION.md` — миграция slug (заблокирована этой проблемой)
