# Backend TODO - Задачи по доработке FastAPI бэкенда

> Файл создан: 14.12.2025
> Последнее обновление: 14.12.2025

## Статус задач

| # | Задача | Приоритет | Статус |
|---|--------|-----------|--------|
| 1 | [CORS: динамическая проверка origins](#1-cors-динамическая-проверка-origins) | 🔴 Высокий | ⏳ TODO |
| 2 | ~~Config: дублирование и неверный prefix~~ | 🟡 Средний | ✅ DONE |

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

## ✅ 2. Config: дублирование и неверный prefix (РЕШЕНО)

**Было:**
- `config.py` создавал битый путь `/api/api/v2/config`
- `training.py` создавал правильный `/api/v2/config`
- Frontend вызывал несуществующий `/api/v2/training/config`

**Исправлено:**
- Коммит `70b15ef`: Убран импорт и регистрация config.router из main.py
- Коммит `d31b11d`: Исправлен путь в frontend `/api/v2/config`
- Коммит `0bb346c`: config.py помечен как DEPRECATED

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
