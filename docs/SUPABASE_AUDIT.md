# Аудит прямого использования Supabase

**Дата:** 2026-01-06
**Цель:** Выявить все места, где Next.js напрямую обращается к Supabase вместо FastAPI бэкенда

---

## Резюме

Найдено **34 файла** с прямым использованием Supabase. Основные категории:

| Категория | Кол-во файлов | Приоритет миграции |
|-----------|---------------|-------------------|
| Пользовательские страницы | 3 | Высокий |
| API роуты (user-facing) | 12 | Высокий |
| Admin actions | 8 | Средний |
| Activity logging | 2 | Низкий |
| Auth (Supabase Auth) | 3 | Отдельно |

---

## 1. Пользовательские страницы (Server Components)

### `/app/my-photos/page.tsx`
- **Операция:** READ
- **Таблицы:** `photo_faces`, `gallery_images`, `galleries`
- **Что делает:** Загружает все фото, где отмечен текущий пользователь
- **Нужен endpoint:** `GET /api/users/{person_id}/photos`

### `/app/settings/page.tsx`
- **Операция:** READ
- **Таблицы:** `people`
- **Что делает:** Загружает профиль пользователя для формы настроек
- **Нужен endpoint:** `GET /api/users/{person_id}/profile`

### `/app/favorites/page.tsx`
- **Операция:** READ
- **Таблицы:** `favorites`, `gallery_images`, `galleries`
- **Что делает:** Загружает избранные фото пользователя
- **Нужен endpoint:** `GET /api/users/{user_id}/favorites`

---

## 2. API роуты (User-Facing)

### Операции с фото (My Photos)

| Файл | Метод | Операция | Таблицы |
|------|-------|----------|---------|
| `/api/my-photos/[id]/verify` | POST | UPDATE | photo_faces |
| `/api/my-photos/[id]/reject` | POST | UPDATE | photo_faces |
| `/api/my-photos/[id]/hide` | POST | UPDATE | photo_faces |
| `/api/my-photos/[id]/unhide` | POST | UPDATE | photo_faces |

**Нужны endpoints:**
- `POST /api/photo-faces/{id}/verify`
- `POST /api/photo-faces/{id}/reject`
- `POST /api/photo-faces/{id}/hide`
- `POST /api/photo-faces/{id}/unhide`

### Избранное

| Файл | Метод | Операция | Таблицы |
|------|-------|----------|---------|
| `/api/favorites/route.ts` | GET | READ | favorites, gallery_images |
| `/api/favorites/[imageId]` | GET | READ | favorites |
| `/api/favorites/[imageId]` | POST | TOGGLE | favorites |

**Нужны endpoints:**
- `GET /api/users/{user_id}/favorites`
- `GET /api/favorites/check/{image_id}?user_id=X`
- `POST /api/favorites/toggle`

### Лайки

| Файл | Метод | Операция | Таблицы |
|------|-------|----------|---------|
| `/api/likes/[imageId]` | GET | READ | likes |
| `/api/likes/[imageId]` | POST | TOGGLE | likes |

**Нужны endpoints:**
- `GET /api/images/{id}/likes?user_id=X`
- `POST /api/images/{id}/likes/toggle`

### Комментарии

| Файл | Метод | Операция | Таблицы |
|------|-------|----------|---------|
| `/api/comments/[imageId]` | GET | READ | comments, users |
| `/api/comments/[imageId]` | POST | INSERT | comments |
| `/api/comments/[imageId]/[commentId]` | PATCH | UPDATE | comments |
| `/api/comments/[imageId]/[commentId]` | DELETE | DELETE | comments |

**Нужны endpoints:**
- `GET /api/images/{id}/comments`
- `POST /api/images/{id}/comments`
- `PATCH /api/comments/{id}`
- `DELETE /api/comments/{id}`

### Настройки

| Файл | Метод | Операция | Таблицы |
|------|-------|----------|---------|
| `/api/settings` | PUT | UPDATE | people |

**Нужен endpoint:** `PUT /api/users/{person_id}/profile`

### Скачивания

| Файл | Метод | Операция | Функция |
|------|-------|----------|---------|
| `/api/downloads/[imageId]` | POST | RPC | increment_download_count |

**Нужен endpoint:** `POST /api/images/{id}/download`

---

## 3. Авторизация

### `/api/auth/telegram/route.ts`
- **Операции:** READ + INSERT + UPDATE
- **Таблицы:** `people`, `users`
- **Что делает:** Полный флоу Telegram авторизации
- **Сложность:** Высокая (много бизнес-логики)

**Нужен endpoint:** `POST /api/auth/telegram`

### `/app/admin/(auth)/auth/callback/route.ts`
- **Использует:** Supabase Auth (exchangeCodeForSession)
- **Статус:** Оставить как есть (это Supabase Auth, не данные)

### `/app/admin/actions/auth.ts`
- **Использует:** Supabase Auth (signIn, signUp, signOut)
- **Статус:** Оставить как есть (это Supabase Auth для админки)

---

## 4. Admin Actions (Server Actions)

### Integrity Check & Fix

| Файл | Функции | Приоритет |
|------|---------|-----------|
| `/admin/actions/integrity/check-integrity.ts` | checkDatabaseIntegrityFullAction | Средний |
| `/admin/actions/integrity/fix-integrity.ts` | fixIntegrityIssuesAction | Средний |
| `/admin/actions/integrity/face-actions.ts` | getIssueDetailsAction, confirmFaceAction, rejectFaceAction | Средний |

### People Management

| Файл | Функции | Приоритет |
|------|---------|-----------|
| `/admin/actions/people/duplicate-people.ts` | findDuplicatePeopleAction, deletePersonWithUnlinkAction, mergePeopleAction | Средний |

### Cleanup & Debug

| Файл | Функции | Приоритет |
|------|---------|-----------|
| `/admin/actions/cleanup.ts` | syncVerifiedAndConfidenceAction, cleanupDuplicateFacesAction | Низкий |
| `/admin/actions/debug.ts` | debugPersonPhotosAction, debugPhotoFacesAction | Низкий |

---

## 5. Activity Logging

| Файл | Таблица | Статус |
|------|---------|--------|
| `/lib/activity-logger.ts` | user_activity | Fire-and-forget |
| `/lib/admin-activity-logger.ts` | admin_activity | Fire-and-forget |

**Рекомендация:** Можно оставить напрямую или перенести в FastAPI для консистентности.

---

## План миграции

### Фаза 1: User-Facing API (Высокий приоритет)

**Порядок:**
1. `POST /api/auth/telegram` — критично для авторизации
2. `GET/PUT /api/users/{person_id}/profile` — настройки
3. `GET /api/users/{person_id}/photos` — мои фото (read)
4. `POST /api/photo-faces/{id}/*` — операции с фото (verify/reject/hide/unhide)
5. `GET/POST /api/users/{user_id}/favorites` — избранное
6. `GET/POST /api/images/{id}/likes` — лайки
7. `GET/POST/PATCH/DELETE /api/images/{id}/comments` — комментарии

**Оценка:** ~15-20 endpoints

### Фаза 2: Admin Actions (Средний приоритет)

Перенести server actions в FastAPI endpoints:
- `/api/admin/integrity/check`
- `/api/admin/integrity/fix`
- `/api/admin/people/duplicates`
- `/api/admin/people/merge`

**Оценка:** ~8-10 endpoints

### Фаза 3: Activity Logging (Низкий приоритет)

- `/api/activity/user` — логирование активности
- `/api/activity/admin` — логирование админ-активности

**Оценка:** ~2-3 endpoints

---

## Таблицы для миграции

| Таблица | Кол-во файлов | FastAPI endpoints нужны |
|---------|---------------|------------------------|
| photo_faces | 14 | Да |
| people | 8 | Да |
| gallery_images | 8 | Частично есть |
| galleries | 5 | Есть |
| favorites | 3 | Да |
| likes | 2 | Да |
| comments | 3 | Да |
| users | 2 | Да |
| user_activity | 1 | Опционально |
| admin_activity | 1 | Опционально |

---

## Что уже мигрировано на FastAPI

- `GET /api/galleries` — список галерей
- `GET /api/galleries/{id}` — галерея с фото
- `GET /api/players` — список игроков
- `GET /api/players/{id}` — игрок с фото
- `POST /api/upload` — загрузка фото
- `POST /api/user/avatar` — загрузка аватара

---

## Рекомендации

1. **Начать с авторизации** — `POST /api/auth/telegram` критичен
2. **User-facing endpoints** — они влияют на UX
3. **Admin actions** — можно оставить на потом, они работают
4. **Activity logging** — низкий приоритет, можно оставить

**Общий объём работ:** ~25-30 новых FastAPI endpoints
