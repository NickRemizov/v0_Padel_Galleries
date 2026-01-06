# Аудит: Supabase vs FastAPI

**Дата:** 2026-01-06
**Обновлено:** после удаления мёртвого кода Supabase Auth

---

## Резюме

| Категория | Supabase | FastAPI | Статус |
|-----------|----------|---------|--------|
| Главная страница | - | ✅ | Мигрировано |
| Галереи | - | ✅ | Мигрировано |
| Игроки | - | ✅ | Мигрировано |
| Настройки | ✅ | - | Нужна миграция |
| Мои фото | ✅ | - | Нужна миграция |
| Избранное | ✅ | - | Нужна миграция |
| Лайки/Комментарии | ✅ | - | Нужна миграция |
| Telegram Auth | ✅ | - | Нужна миграция |
| Admin Integrity | ✅ | - | Низкий приоритет |
| Activity Logging | ✅ | - | Низкий приоритет |

---

## Удалённый мёртвый код

```
✗ app/admin/actions/auth.ts           - старый Supabase Auth
✗ app/admin/(auth)/auth/callback/     - старый callback
✗ components/admin/login-form.tsx     - старая форма логина
✗ export * from "./auth" в index.ts   - экспорт удалённого модуля
```

---

## Текущая архитектура авторизации

```
Админка:   Google OAuth → FastAPI → admin_token cookie → middleware.ts
Юзеры:    Telegram Auth → Next.js API → Supabase напрямую → telegram_user cookie
```

**Проблема:** Telegram Auth ещё не мигрирован на FastAPI.

---

## Что уже работает через FastAPI

### Страницы
| Страница | Endpoint |
|----------|----------|
| `/` (главная) | `GET /api/galleries` |
| `/gallery/[id]` | `GET /api/galleries/{id}?full=true` |
| `/players` | `GET /api/people` |
| `/players/[id]` | `GET /api/people/{id}/photos` |

### Admin Actions
| Модуль | Endpoints |
|--------|-----------|
| galleries.ts | `/api/galleries/*` |
| entities.ts | `/api/people/*` |
| recognition.ts | `/api/recognition/*`, `/api/faces/*` |
| faces/*.ts | `/api/faces/*`, `/api/images/*` |

---

## Что ещё использует Supabase напрямую

### 1. Пользовательские страницы (Высокий приоритет)

| Файл | Операция | Таблицы |
|------|----------|---------|
| `app/settings/page.tsx` | READ | people |
| `app/my-photos/page.tsx` | READ | photo_faces, gallery_images |
| `app/favorites/page.tsx` | READ | favorites, gallery_images |

### 2. API Routes (Высокий приоритет)

| Файл | Методы | Таблицы |
|------|--------|---------|
| `api/auth/telegram/route.ts` | POST | people, users |
| `api/settings/route.ts` | PUT | people |
| `api/my-photos/[id]/verify` | POST | photo_faces |
| `api/my-photos/[id]/reject` | POST | photo_faces |
| `api/my-photos/[id]/hide` | POST | photo_faces |
| `api/my-photos/[id]/unhide` | POST | photo_faces |
| `api/favorites/route.ts` | GET | favorites |
| `api/favorites/[imageId]` | GET, POST | favorites |
| `api/likes/[imageId]` | GET, POST | likes |
| `api/comments/[imageId]` | GET, POST | comments |
| `api/comments/[id]/[commentId]` | PATCH, DELETE | comments |
| `api/downloads/[imageId]` | POST | RPC: increment_download_count |

### 3. Admin Actions (Средний приоритет)

| Файл | Операции |
|------|----------|
| `admin/actions/integrity/check-integrity.ts` | READ photo_faces |
| `admin/actions/integrity/fix-integrity.ts` | UPDATE/DELETE photo_faces |
| `admin/actions/integrity/face-actions.ts` | UPDATE photo_faces |
| `admin/actions/integrity/utils.ts` | READ helpers |
| `admin/actions/cleanup.ts` | UPDATE photo_faces |
| `admin/actions/debug.ts` | READ photo_faces |
| `admin/actions/people/duplicate-people.ts` | READ/UPDATE/DELETE people, photo_faces |

### 4. Activity Logging (Низкий приоритет)

| Файл | Таблица |
|------|---------|
| `lib/activity-logger.ts` | user_activity |
| `lib/admin-activity-logger.ts` | admin_activity |

---

## План миграции

### Фаза 1: Авторизация (Критично)

```
POST /api/auth/telegram
  - Поиск/создание person
  - Поиск/создание user
  - Генерация JWT
```

### Фаза 2: User Profile & Settings

```
GET  /api/users/{person_id}/profile
PUT  /api/users/{person_id}/profile
GET  /api/users/{person_id}/photos      (для /my-photos)
GET  /api/users/{user_id}/favorites     (для /favorites)
```

### Фаза 3: Photo Face Operations

```
POST /api/photo-faces/{id}/verify
POST /api/photo-faces/{id}/reject
POST /api/photo-faces/{id}/hide
POST /api/photo-faces/{id}/unhide
```

### Фаза 4: Social Features

```
GET  /api/images/{id}/likes?user_id=X
POST /api/images/{id}/likes/toggle
GET  /api/images/{id}/comments
POST /api/images/{id}/comments
PATCH /api/comments/{id}
DELETE /api/comments/{id}
GET/POST /api/users/{user_id}/favorites
POST /api/images/{id}/download  (increment counter)
```

### Фаза 5: Admin Integrity (Низкий приоритет)

Можно оставить на Supabase — это внутренние админские операции.

---

## Supabase Client Files

| Файл | Используется | Назначение |
|------|--------------|------------|
| `lib/supabase/service.ts` | ✅ Да | Service role клиент (bypasses RLS) |
| `lib/supabase/server.ts` | ✅ Да | SSR клиент для admin actions |
| `lib/supabase/middleware.ts` | ✅ Да | **НЕ Supabase!** JWT middleware для Google OAuth |

**Примечание:** `middleware.ts` неправильно лежит в папке supabase — это JWT валидация для admin_token, не имеет отношения к Supabase.

---

## Оценка работ

| Фаза | Endpoints | Сложность |
|------|-----------|-----------|
| 1. Auth | 1 | Высокая |
| 2. Profile | 4 | Средняя |
| 3. Photo Faces | 4 | Низкая |
| 4. Social | 7-8 | Средняя |
| 5. Admin | - | Пропустить |

**Итого:** ~15-17 новых FastAPI endpoints

---

## Рекомендации

1. **middleware.ts** — переместить из `lib/supabase/` в `lib/auth/` или `lib/middleware/`
2. **Telegram Auth** — мигрировать первым, т.к. это критичный путь
3. **Admin integrity** — оставить на Supabase, не критично
4. **Activity logging** — можно оставить или перенести для консистентности
