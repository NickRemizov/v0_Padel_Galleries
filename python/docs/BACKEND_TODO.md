# Backend TODO - Задачи по доработке FastAPI бэкенда

> Файл создан: 14.12.2025
> Последнее обновление: 14.12.2025

## Статус задач

| # | Задача | Приоритет | Статус |
|---|--------|-----------|--------|
| 1 | [CORS: динамическая проверка origins](#1-cors-динамическая-проверка-origins) | 🔴 Высокий | ⏳ TODO |
| 2 | [Config: дублирование и неверный prefix](#2-config-дублирование-и-неверный-prefix) | 🟡 Средний | ⏳ TODO |

---

## 1. CORS: динамическая проверка origins

**Проблема:**
- В `main.py` есть функция `is_origin_allowed()`, но она не используется (мёртвый код)
- Реально настроено `allow_origins=["*"]` + `allow_credentials=True`
- Это проблемная связка:
  - По спецификации CORS браузеры игнорируют `Access-Control-Allow-Origin: *` при credential-запросах
  - Любой сайт может делать запросы к API (проблема безопасности)

**Текущий код (main.py:51-65):**
```python
# Функция есть, но НЕ используется
def is_origin_allowed(origin: str) -> bool:
    if origin in settings.cors_origins or "*" in settings.cors_origins:
        return True
    if vercel_preview_pattern.match(origin):
        return True
    return False

# Реальная настройка - небезопасная
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # ← Разрешено ВСЁ
    allow_credentials=True,     # ← Конфликт с "*"
    ...
)
```

**Решение:**
Создать кастомный CORS middleware с динамической проверкой origins:

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class DynamicCORSMiddleware(BaseHTTPMiddleware):
    """
    Кастомный CORS middleware с поддержкой:
    - Статического списка разрешённых origins
    - Динамических Vercel preview URLs (*.vercel.app)
    """
    
    def __init__(self, app, allowed_origins: list[str], allow_vercel_previews: bool = True):
        super().__init__(app)
        self.allowed_origins = set(allowed_origins)
        self.allow_vercel_previews = allow_vercel_previews
        self.vercel_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.vercel\.app$")
    
    def is_origin_allowed(self, origin: str) -> bool:
        if not origin:
            return False
        if origin in self.allowed_origins:
            return True
        if self.allow_vercel_previews and self.vercel_pattern.match(origin):
            return True
        return False
    
    async def dispatch(self, request, call_next):
        origin = request.headers.get("origin", "")
        
        # Preflight OPTIONS request
        if request.method == "OPTIONS":
            if self.is_origin_allowed(origin):
                return Response(
                    status_code=200,
                    headers={
                        "Access-Control-Allow-Origin": origin,
                        "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                        "Access-Control-Allow-Headers": "*",
                        "Access-Control-Max-Age": "3600",
                    }
                )
            return Response(status_code=403)
        
        # Regular request
        response = await call_next(request)
        
        if self.is_origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        return response
```

**Использование:**
```python
# Убрать стандартный CORSMiddleware
# Добавить кастомный:
app.add_middleware(
    DynamicCORSMiddleware,
    allowed_origins=[
        "https://padelvalencia.vercel.app",
        "http://localhost:3000",
    ],
    allow_vercel_previews=True,
)
```

**Файлы для изменения:**
- `python/main.py` - убрать стандартный CORSMiddleware, добавить DynamicCORSMiddleware
- (опционально) `python/core/middleware.py` - вынести middleware в отдельный файл

**Тесты:**
- [ ] Запросы с `https://padelvalencia.vercel.app` работают
- [ ] Запросы с `https://xxx-yyy.vercel.app` (preview) работают
- [ ] Запросы с `http://localhost:3000` работают
- [ ] Запросы с неизвестных origins блокируются
- [ ] Preflight OPTIONS запросы возвращают правильные headers

---

## 2. Config: дублирование и неверный prefix

**Проблема:**
Есть два файла с эндпоинтами `/config`, которые работают по-разному:

**A) `python/routers/config.py`:**
```python
# Строка 17 - роутер со своим prefix
router = APIRouter(prefix="/api/v2", tags=["config"])

# main.py строка 206 - подключается ЕЩЁ с prefix
app.include_router(config.router, prefix="/api", tags=["config"])

# ИТОГ: /api + /api/v2 + /config = /api/api/v2/config ❌ (битый путь!)
```
- Работает с таблицей `recognition_settings`, ключ `quality_filters`
- Использует `SupabaseClient`

**B) `python/routers/training.py`:**
```python
# Строка 17 - роутер БЕЗ prefix
router = APIRouter()

# main.py строка 203
app.include_router(training.router, prefix="/api/v2", tags=["training"])

# ИТОГ: /api/v2/config ✓ (правильный путь)
```
- Работает через `training_service.supabase.get_recognition_config()`
- Использует `SupabaseClient` через TrainingService

**Результат:**
- Два разных эндпоинта `/config` с разной логикой
- `config.py` вероятно не используется (битый URL)
- Путаница в том, какой конфиг где хранится

**Решение:**

**Вариант A - Удалить config.py (рекомендуется):**
1. Проверить, что фронтенд НЕ использует `/api/api/v2/config`
2. Удалить `python/routers/config.py`
3. Убрать импорт и регистрацию из `main.py`
4. Оставить только `/api/v2/config` из `training.py`

**Вариант B - Исправить config.py:**
1. Убрать `prefix="/api/v2"` из `config.py`
2. Объединить логику с `training.py` или разделить ответственность
3. Унифицировать работу с таблицей конфигов

**Файлы для изменения:**
- `python/routers/config.py` - удалить или исправить prefix
- `python/main.py` - убрать регистрацию config.router если удаляем
- `python/routers/__init__.py` - убрать экспорт если удаляем

**Проверка перед удалением:**
```bash
# Поиск использования /api/api/v2/config в коде
grep -r "api/api/v2/config" .
grep -r "api/v2/config" .
```

**Тесты:**
- [ ] `/api/v2/config` GET возвращает конфиг
- [ ] `/api/v2/config` PUT обновляет конфиг
- [ ] Старый путь `/api/api/v2/config` возвращает 404

---

## Будущие задачи

> Сюда будут добавляться задачи из аудита

<!-- 
## 3. Название задачи

**Проблема:**
...

**Решение:**
...

**Файлы для изменения:**
...
-->
