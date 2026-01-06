# Аудит: Supabase vs FastAPI

**Дата:** 2026-01-06
**Статус:** Миграция завершена

---

## Резюме

| Категория | Статус |
|-----------|--------|
| Главная страница | ✅ FastAPI |
| Галереи | ✅ FastAPI |
| Игроки | ✅ FastAPI |
| Настройки | ✅ FastAPI |
| Мои фото | ✅ FastAPI |
| Избранное | ✅ FastAPI |
| Лайки/Комментарии | ✅ FastAPI |
| Telegram Auth | ✅ FastAPI |
| Admin Integrity | Supabase (низкий приоритет) |

---

## Архитектура

```
Админка:   Google OAuth → FastAPI → admin_token cookie
Юзеры:    Telegram Auth → FastAPI → telegram_user cookie
Данные:   Next.js → apiFetch() → FastAPI → Supabase
```

---

## FastAPI User Endpoints

### Auth (`/api/auth`)
| Endpoint | Описание |
|----------|----------|
| `POST /api/auth/telegram` | Telegram авторизация |

### Profile (`/api/user`)
| Endpoint | Описание |
|----------|----------|
| `GET /api/user/profile/{person_id}` | Получить профиль |
| `PUT /api/user/profile/{person_id}` | Обновить профиль |
| `GET /api/user/my-photos` | Фотографии пользователя |
| `GET /api/user/favorites-full` | Избранное с деталями |

### Photo Faces (`/api/user`)
| Endpoint | Описание |
|----------|----------|
| `POST /api/user/photo-faces/{id}/verify` | Подтвердить лицо |
| `POST /api/user/photo-faces/{id}/reject` | Отклонить лицо |
| `POST /api/user/photo-faces/{id}/hide` | Скрыть от себя |
| `POST /api/user/photo-faces/{id}/unhide` | Показать снова |

### Social (`/api/user`)
| Endpoint | Описание |
|----------|----------|
| `GET /api/user/images/{id}/likes` | Лайки фото |
| `POST /api/user/images/{id}/likes/toggle` | Лайк/анлайк |
| `GET /api/user/images/{id}/comments` | Комментарии |
| `POST /api/user/images/{id}/comments` | Добавить комментарий |
| `PATCH /api/user/comments/{id}` | Редактировать |
| `DELETE /api/user/comments/{id}` | Удалить |
| `GET /api/user/images/{id}/favorite` | Проверить избранное |
| `POST /api/user/images/{id}/favorite/toggle` | В избранное |
| `POST /api/user/images/{id}/download` | Счётчик скачиваний |

---

## Что осталось на Supabase

### Admin Actions (низкий приоритет)
- `admin/actions/integrity/*` — проверка целостности
- `admin/actions/cleanup.ts` — очистка данных
- `admin/actions/debug.ts` — отладка
- `admin/actions/people/duplicate-people.ts` — дубликаты

### Activity Logging
- `lib/activity-logger.ts` — логи пользователей
- `lib/admin-activity-logger.ts` — логи админов

---

## Supabase Client Files

| Файл | Назначение |
|------|------------|
| `lib/supabase/service.ts` | Service role для admin actions |
| `lib/supabase/server.ts` | SSR клиент для admin |
