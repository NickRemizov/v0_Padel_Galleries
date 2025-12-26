# План защиты Backend авторизацией

> **Создано:** 26 декабря 2025
> **Статус:** В работе
> **Причина:** Предыдущая попытка (v1.2.0) сломала проект, нужен аккуратный подход

---

## 🔴 Анализ ошибок v1.2.0

| # | Ошибка | Последствия |
|---|--------|-------------|
| 1 | Удалили Next.js API routes (`app/api/*`) | Mixed Content (HTTPS→HTTP), CORS errors |
| 2 | Полная перезапись auth.py | Потеряли рабочий код, сломали импорты |
| 3 | Middleware на ВСЕ write операции | Server Actions перестали работать |
| 4 | apiClient.ts с Supabase в server components | `createBrowserClient()` не работает на сервере |
| 5 | 25+ коммитов за 6 часов | Невозможно откатить частично |
| 6 | Не тестировали локально | Проблемы только на production |

### Корневая причина

Не учли архитектуру:
- **Browser → Next.js API routes → FastAPI** (нужен proxy с token)
- **Server Components → FastAPI напрямую** (без browser token)

---

## ✅ Принципы нового подхода

1. **Инкрементально** — по одному эндпоинту за раз
2. **Не трогать публичные GET** — работают без auth
3. **Сохранить Next.js proxy** — решает CORS/Mixed Content
4. **Тестировать каждый шаг** — локально и на preview
5. **Маленькие коммиты** — легко откатить

---

## Phase 0: Подготовка инфраструктуры

**Цель:** Создать auth функции БЕЗ изменения поведения

**Файлы:**
\`\`\`
python/services/auth.py  — добавить новые функции (не удалять старые!)
\`\`\`

**Новые функции:**
\`\`\`python
async def verify_supabase_token(token: str) -> dict
    """Проверка Supabase JWT, возврат user info"""

async def get_current_user_optional(credentials) -> Optional[dict]
    """Для эндпоинтов с опциональной авторизацией"""

async def require_auth(credentials) -> dict
    """Для эндпоинтов, требующих авторизацию (любой user)"""

async def require_admin(credentials) -> dict
    """Для admin-only эндпоинтов"""
\`\`\`

**Тест:** Backend запускается, всё работает как раньше

**Оценка:** 1 час

---

## Phase 1: Тестовый эндпоинт

**Цель:** Проверить механизм на одном редко используемом эндпоинте

**Выбор:** `POST /api/admin/training/execute`

**Шаги:**

### 1.1 Backend
\`\`\`python
# python/routers/admin/training.py
from services.auth import require_admin

@router.post("/training/execute")
async def execute_training(
    user: dict = Depends(require_admin)  # ← добавить
):
    ...
\`\`\`

### 1.2 Frontend proxy
\`\`\`typescript
// app/api/admin/training/execute/route.ts
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  const response = await fetch(`${FASTAPI_URL}/api/admin/training/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': session ? `Bearer ${session.access_token}` : '',
    },
    body: await request.text(),
  })
  
  return new Response(response.body, { status: response.status })
}
\`\`\`

### 1.3 Тесты
- [ ] Без auth → 401
- [ ] С auth (не admin) → 403
- [ ] С auth (admin) → работает
- [ ] Остальные эндпоинты → работают без изменений

**Оценка:** 2 часа

---

## Phase 2: Критичные write эндпоинты

**Порядок добавления:**

| # | Эндпоинт | Файл backend | Файл proxy |
|---|----------|--------------|------------|
| 1 | `DELETE /api/people/{id}` | `routers/people/crud.py` | `app/api/people/[id]/route.ts` |
| 2 | `PUT /api/people/{id}` | `routers/people/crud.py` | `app/api/people/[id]/route.ts` |
| 3 | `POST /api/people` | `routers/people/crud.py` | `app/api/people/route.ts` |
| 4 | `DELETE /api/galleries/{id}` | `routers/galleries.py` | `app/api/galleries/[id]/route.ts` |
| 5 | `PUT /api/galleries/{id}` | `routers/galleries.py` | `app/api/galleries/[id]/route.ts` |
| 6 | `POST /api/photo_faces/assign` | `routers/faces/crud.py` | `app/api/recognition/.../route.ts` |

**Для каждого эндпоинта:**
1. Добавить `Depends(require_admin)` в backend
2. Обновить/создать Next.js proxy route с передачей token
3. Протестировать все сценарии
4. Коммит с понятным названием
5. Подождать deploy, проверить production

**Оценка:** 4-6 часов

---

## Phase 3: Остальные admin эндпоинты

| Группа | Эндпоинты |
|--------|-----------|
| Training | `GET/PUT /training/config`, `POST /training/prepare`, `GET /training/status/*` |
| Cleanup | `POST /cleanup/*` |
| Debug | `GET /debug/*` |
| Statistics | `GET /face-statistics` |

**Оценка:** 2-3 часа

---

## Phase 4: CORS hardening

После работающей авторизации:

\`\`\`python
# main.py
import re

ALLOWED_ORIGINS = [
    "https://vlcpadel.com",
    "https://www.vlcpadel.com",
]

ALLOWED_ORIGIN_PATTERNS = [
    r"https://.*\.vercel\.app$",  # Preview deployments
]

def is_origin_allowed(origin: str) -> bool:
    if origin in ALLOWED_ORIGINS:
        return True
    for pattern in ALLOWED_ORIGIN_PATTERNS:
        if re.match(pattern, origin):
            return True
    return False
\`\`\`

**Оценка:** 1 час

---

## 📋 Чеклист перед каждым деплоем

- [ ] `GET /api/people` работает без auth
- [ ] `GET /api/galleries` работает без auth  
- [ ] Публичные страницы загружаются (/, /players, /gallery/*)
- [ ] Admin panel загружается
- [ ] Face statistics отображается
- [ ] Training manager работает
- [ ] Integrity check работает

---

## 🚫 Запрещено

1. ❌ Глобальный middleware на все запросы
2. ❌ Удаление Next.js API routes
3. ❌ Изменение apiClient.ts для server components
4. ❌ Больше 3-4 файлов за один коммит
5. ❌ Деплой без тестирования

---

## 📊 Прогресс

| Phase | Статус | Дата |
|-------|--------|------|
| Phase 0: Инфраструктура | ⏳ В работе | 26.12.2025 |
| Phase 1: Тестовый эндпоинт | ⏳ Ожидает | — |
| Phase 2: Критичные endpoints | ⏳ Ожидает | — |
| Phase 3: Остальные admin | ⏳ Ожидает | — |
| Phase 4: CORS | ⏳ Ожидает | — |

---

## Связанные документы

- `docs/ROADMAP.md` — общий план работ
- `docs/PROJECT_CONTEXT.md` — архитектура проекта
