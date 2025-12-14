# Backend TODO - Задачи по доработке FastAPI бэкенда

> Файл создан: 14.12.2025
> Последнее обновление: 14.12.2025

## Статус задач

| # | Задача | Приоритет | Статус |
|---|--------|-----------|--------|
| 1 | [CORS: динамическая проверка origins](#1-cors-динамическая-проверка-origins) | 🔴 Высокий | ⏳ TODO |
| 2 | ~~Config: дублирование и неверный prefix~~ | 🟡 Средний | ✅ DONE |
| 3 | [DI: глобальные переменные вместо Depends](#3-di-глобальные-переменные-вместо-depends) | 🟡 Средний | ⏳ TODO |
| 4 | [Async/Sync: блокирующие вызовы в async](#4-asyncsync-блокирующие-вызовы-в-async) | 🟡 Средний | ⏳ TODO |
| 5 | [Контракт ошибок: унификация](#5-контракт-ошибок-унификация) | 🟢 Низкий | ✅ DONE (частично) |
| 6 | [Репозиторий БД: объединить SupabaseClient и SupabaseDatabase](#6-репозиторий-бд-объединить-supabaseclient-и-supabasedatabase) | 🟡 Средний | ⏳ TODO |

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

## 3. DI: глобальные переменные вместо Depends

**Проблема:**
Все роутеры используют анти-паттерн с глобальными переменными для Dependency Injection:

```python
# people.py, faces.py, galleries.py, etc. - везде одинаково
supabase_db_instance: SupabaseDatabase = None
face_service_instance: FaceRecognitionService = None

def set_services(supabase_db: SupabaseDatabase, face_service: FaceRecognitionService):
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service

# А в main.py вызывается:
people.set_services(supabase_db, face_service)
faces.set_services(face_service, supabase_db)  # Порядок аргументов разный!
```

**Почему это плохо:**
- Порядок инициализации критичен — если вызвать эндпоинт до `set_services()`, будет `None`
- Тестирование сложное — нужно мокать глобальные переменные
- Порядок аргументов в `set_services()` разный в разных роутерах — легко ошибиться
- Нет изоляции между тестами

**Решение:**

**Вариант A — Правильный FastAPI Depends:**
```python
# core/dependencies.py
from functools import lru_cache

@lru_cache()
def get_supabase_db() -> SupabaseDatabase:
    return SupabaseDatabase()

@lru_cache()
def get_face_service(supabase_db: SupabaseDatabase = Depends(get_supabase_db)) -> FaceRecognitionService:
    return FaceRecognitionService(supabase_db=supabase_db)

# В роутерах:
@router.get("")
async def get_people(
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    ...
```

**Вариант B — Dependency Container (для тяжёлых сервисов):**
```python
# core/container.py
class ServiceContainer:
    _instance = None
    
    def __init__(self):
        self.supabase_db = SupabaseDatabase()
        self.face_service = FaceRecognitionService(supabase_db=self.supabase_db)
    
    @classmethod
    def get(cls) -> "ServiceContainer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

def get_container() -> ServiceContainer:
    return ServiceContainer.get()

# В роутерах:
@router.get("")
async def get_people(container: ServiceContainer = Depends(get_container)):
    result = container.supabase_db.client.table("people")...
```

**Файлы для изменения:**
- Создать `python/core/dependencies.py`
- Изменить все роутеры: `people.py`, `faces.py`, `galleries.py`, `images.py`, `photographers.py`, `locations.py`, `organizers.py`, `cities.py`, `training.py`, `recognition.py`
- Изменить `main.py` — убрать вызовы `set_services()`

**Оценка трудозатрат:** ~2-3 часа

---

## 4. Async/Sync: блокирующие вызовы в async

**Проблема:**
Все эндпоинты объявлены как `async def`, но вызовы к Supabase — синхронные:

```python
# routers/people.py
async def get_people(...):
    # ЭТО СИНХРОННЫЙ ВЫЗОВ внутри async функции!
    result = supabase_db_instance.client.table("people").select("*").execute()
```

```python
# services/supabase_database.py - ВСЕ методы синхронные
def get_recognition_config(self) -> Dict:  # def, не async def!
    response = self.client.table("face_recognition_config").select(...).execute()

# НО в faces.py вызывается с await - ОШИБКА!
config = await supabase_db.get_recognition_config()  # await на sync метод
```

**Почему это плохо:**
- Блокирует event loop на время выполнения запроса к БД
- При нагрузке — "подвисания" даже при небольшой конкурентности
- Особенно плохо в циклах (например, `_calculate_people_stats`, `delete_gallery`)

**Решение:**

**Вариант A — asyncio.to_thread() (быстрый фикс):**
```python
import asyncio

async def get_people(...):
    result = await asyncio.to_thread(
        supabase_db_instance.client.table("people").select("*").execute
    )
```

**Вариант B — Async Supabase клиент (правильное решение):**
```python
# Использовать supabase-py async версию
from supabase import acreate_client, AsyncClient

class AsyncSupabaseDatabase:
    def __init__(self):
        self.client: AsyncClient = None
    
    async def init(self):
        self.client = await acreate_client(url, key)
    
    async def get_recognition_config(self) -> Dict:
        response = await self.client.table("face_recognition_config").select(...).execute()
```

**Файлы для изменения:**
- `python/services/supabase_database.py` — переписать на async
- Все роутеры — обновить вызовы

**Оценка трудозатрат:** ~4-6 часов (вариант B)

**Быстрый фикс (вариант A):** ~1 час

---

## ✅ 5. Контракт ошибок: унификация (ЧАСТИЧНО РЕШЕНО)

**Было:**
- Мёртвый импорт `HTTPException` в `galleries.py`

**Исправлено:**
- Коммит `5ccb85e`: Убран неиспользуемый импорт HTTPException

**Оставшиеся проблемы:**
- Несогласованность async/sync в методах (связано с задачей #4)
- Неконсистентная обработка ошибок в сервисах

---

## 6. Репозиторий БД: объединить SupabaseClient и SupabaseDatabase

**Проблема:**
Существуют два класса для работы с БД, которые дублируют функционал:

| Метод | SupabaseClient | SupabaseDatabase | Примечание |
|-------|----------------|------------------|------------|
| `get_config()` | ✅ async | ✅ sync | ДУБЛИКАТ |
| `get_recognition_config()` | ✅ async | ✅ sync | ДУБЛИКАТ |
| `get_unknown_faces_from_gallery()` | ✅ async | ✅ async | ДУБЛИКАТ |
| `get_all_player_embeddings()` | ❌ | ✅ sync | Уникально |
| `get_verified_faces()` | ✅ async | ❌ | Уникально |
| `update_face_descriptor()` | ✅ async | ❌ | Уникально |
| `create_training_session()` | ✅ async | ❌ | Уникально |
| ... | ... | ... | ... |

**Проблемы:**
1. **Дублирование кода** — одни и те же методы в разных классах
2. **Несогласованность async/sync** — один класс sync, другой async
3. **Путаница** — какой класс использовать в каком случае?
4. **Разные имена** — `SupabaseClient` vs `SupabaseDatabase` не отражают разницу

**Текущее использование:**
- `SupabaseDatabase` — используется в роутерах напрямую, загрузка embeddings
- `SupabaseClient` — используется в TrainingService, работа с сессиями обучения

**Решение:**

**Создать единый Repository слой:**
```
services/
  repositories/
    __init__.py
    base.py              # Базовый класс с клиентом Supabase
    people_repo.py       # CRUD для people
    faces_repo.py        # CRUD для photo_faces
    galleries_repo.py    # CRUD для galleries
    config_repo.py       # Работа с конфигами
    training_repo.py     # Сессии обучения
    embeddings_repo.py   # Загрузка/поиск embeddings
```

**Пример базового класса:**
```python
# services/repositories/base.py
from supabase import acreate_client, AsyncClient

class BaseRepository:
    _client: AsyncClient = None
    
    @classmethod
    async def get_client(cls) -> AsyncClient:
        if cls._client is None:
            cls._client = await acreate_client(url, key)
        return cls._client
```

**Пример репозитория:**
```python
# services/repositories/config_repo.py
class ConfigRepository(BaseRepository):
    async def get_recognition_config(self) -> Dict:
        client = await self.get_client()
        response = await client.table("face_recognition_config").select("*").execute()
        ...
```

**План миграции:**
1. Создать `services/repositories/` с новой структурой
2. Постепенно переносить методы из SupabaseClient/SupabaseDatabase
3. Обновлять роутеры для использования новых репозиториев
4. После полного переноса — удалить старые классы

**Файлы для изменения:**
- Создать `python/services/repositories/`
- Рефакторить `supabase_client.py` и `supabase_database.py`
- Обновить все роутеры и сервисы

**Оценка трудозатрат:** ~6-8 часов (большой рефакторинг)

**Связано с:** Задача #3 (DI), Задача #4 (Async/Sync)

---

## Текущее состояние архитектуры (хорошо)

Уже сделано правильное разделение:
- `routers/recognition/` — разбит на модули: `detect.py`, `recognize.py`, `descriptors.py`, `clusters.py`, `maintenance.py`
- `services/` — есть отдельные файлы:
  - `hnsw_index.py` — работа с HNSW индексом
  - `insightface_model.py` — работа с моделью
  - `quality_filters.py` — фильтры качества
  - `grouping.py` — группировка лиц

**Размеры файлов (текущие):**
| Файл | Размер | Строк (~) | Статус |
|------|--------|-----------|--------|
| `recognition/descriptors.py` | 24KB | ~600 | ⚠️ Крупный |
| `recognition/detect.py` | 20KB | ~500 | ⚠️ Крупный |
| `supabase_client.py` | 24KB | ~600 | ⚠️ Дублирование |
| `supabase_database.py` | 17KB | ~450 | ⚠️ Дублирование |
| `face_recognition.py` | 22KB | ~550 | ⚠️ Крупный |
| `training_service.py` | 20KB | ~500 | OK |

---

## Приоритет выполнения

1. **#1 CORS** — безопасность, сделать первым
2. **#4 Async/Sync** — влияет на производительность
3. **#6 Репозиторий БД** — устраняет дублирование, связано с #4
4. **#3 DI** — архитектурный рефакторинг
5. **#5 Контракт ошибок** — cleanup после остальных задач
