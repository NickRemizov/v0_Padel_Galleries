# Backend Refactoring Brief

> **Цель:** Улучшить структуру и maintainability Python backend
> **Дата:** 30 декабря 2025
> **Версия backend:** v5.1.x
> **Для:** Следующий чат с AI

---

## 🎯 Контекст

Backend работает стабильно. Цель рефакторинга — не переписать, а улучшить:
- Убрать дублирование кода
- Унифицировать паттерны
- Улучшить тестируемость
- Упростить добавление новых features

---

## 📊 Текущая структура

\`\`\`
python/
├── main.py                    # Entry point, DI
├── core/                      # ✅ Хорошо структурирован
│   ├── config.py
│   ├── exceptions.py
│   ├── responses.py
│   └── logging.py
├── middleware/
│   └── auth.py               # ✅ Централизованная auth
├── routers/                   # ⚠️ Требует внимания
│   ├── people/               # ✅ Модульный (образец)
│   ├── faces/                # ✅ Модульный
│   ├── recognition/          # ✅ Модульный
│   ├── galleries.py          # ⚠️ 22KB, монолит
│   ├── images.py             # ⚠️ 18KB, монолит
│   └── training.py           # 7KB, OK
├── services/
│   ├── supabase/             # ⚠️ Много файлов, дублирование
│   ├── face_recognition.py   # 21KB
│   ├── training_service.py   # 21KB
│   └── ...
└── repositories/             # Частично используется
\`\`\`

---

## 🔴 Приоритет 1: Роутеры-монолиты

### galleries.py (22KB)
**Проблема:** Один файл содержит все операции с галереями

**Решение:** Разбить по паттерну people/
\`\`\`
routers/galleries/
├── __init__.py           # Router aggregation
├── crud.py               # Create/Read/Update/Delete
├── images.py             # Операции с фото галереи
├── stats.py              # Статистика галереи
└── helpers.py            # Общие функции
\`\`\`

### images.py (18KB)
**Проблема:** Смешаны CRUD, processing, face operations

**Решение:**
\`\`\`
routers/images/
├── __init__.py
├── crud.py               # Basic CRUD
├── processing.py         # Process, redetect
├── faces.py              # Face-related operations
└── helpers.py
\`\`\`

---

## 🟡 Приоритет 2: Services дублирование

### services/supabase/ (6 файлов)
**Текущее:**
\`\`\`
supabase/
├── __init__.py           # 10KB - SupabaseService class
├── base.py               # Client singleton
├── config.py             # Config repository
├── embeddings.py         # Embeddings operations
├── faces.py              # Face operations
├── people.py             # People operations
└── training.py           # Training operations
\`\`\`

**Проблемы:**
- `__init__.py` слишком большой (10KB)
- Дублирование между `__init__.py` и отдельными файлами
- Неясно что использовать: class или модули

**Решение:**
1. `SupabaseService` в `__init__.py` → делегирует в модули
2. Каждый модуль — самостоятельный repository
3. Убрать дублирование методов

---

## 🟢 Приоритет 3: Типизация

### Добавить Pydantic models
**Где:** `python/models/` (новая папка)

\`\`\`python
# models/person.py
from pydantic import BaseModel

class PersonCreate(BaseModel):
    real_name: str
    club: str | None = None

class PersonResponse(BaseModel):
    id: str
    real_name: str
    avatar_url: str | None
    # ...

# models/gallery.py
class GalleryCreate(BaseModel):
    name: str
    event_date: date
    location_id: str | None
\`\`\`

**Зачем:**
- Автоматическая валидация
- OpenAPI документация
- IDE autocomplete

---

## ⚠️ Правила рефакторинга

### DO (Делать)
- ✅ Один файл за раз
- ✅ Сохранять API endpoints (URLs не меняются)
- ✅ Тестировать после каждого изменения
- ✅ Рестартовать backend после изменений
- ✅ Проверять логи на ошибки

### DON'T (Не делать)
- ❌ Менять URL endpoints
- ❌ Менять формат ответов
- ❌ Рефакторить несколько модулей сразу
- ❌ Удалять код до проверки

---

## 📋 Чеклист для рефакторинга роутера

\`\`\`markdown
## Рефакторинг: [routers/xxx.py]

### Подготовка
- [ ] Прочитать текущий код
- [ ] Определить логические группы endpoints
- [ ] Согласовать структуру

### Выполнение
- [ ] Создать папку routers/xxx/
- [ ] Создать __init__.py с router aggregation
- [ ] Вынести CRUD в crud.py
- [ ] Вынести остальное по группам
- [ ] Обновить main.py если нужно

### Проверка
- [ ] curl проверка всех endpoints
- [ ] Логи без ошибок
- [ ] Frontend работает
- [ ] Commit + push
- [ ] Рестарт backend на сервере
\`\`\`

---

## 🚀 Порядок работы

1. **galleries.py → galleries/** (самый большой)
2. **images.py → images/** 
3. **services/supabase/ cleanup**
4. **Добавить Pydantic models**

---

## 📝 Пример: как разбить galleries.py

**До (один файл 22KB):**
\`\`\`python
# routers/galleries.py
router = APIRouter(prefix="/api/galleries")

@router.get("/")
async def list_galleries(): ...

@router.post("/")
async def create_gallery(): ...

@router.get("/{id}/images")
async def get_gallery_images(): ...

@router.get("/{id}/stats")
async def get_gallery_stats(): ...
\`\`\`

**После (модульная структура):**
\`\`\`python
# routers/galleries/__init__.py
from fastapi import APIRouter
from .crud import router as crud_router
from .images import router as images_router
from .stats import router as stats_router

router = APIRouter(prefix="/api/galleries")
router.include_router(crud_router)
router.include_router(images_router)
router.include_router(stats_router)

# routers/galleries/crud.py
router = APIRouter()

@router.get("/")
async def list_galleries(): ...

@router.post("/")
async def create_gallery(): ...

# routers/galleries/images.py
router = APIRouter()

@router.get("/{gallery_id}/images")
async def get_gallery_images(): ...
\`\`\`

---

## 📚 Ссылки

- `python/ARCHITECTURE.md` — текущая архитектура
- `python/DEPLOYMENT.md` — деплой и рестарт
- `docs/DATABASE_SCHEMA.md` — схема БД
- `docs/PROJECT_CONTEXT.md` — контекст проекта

---

*Создано: 30 декабря 2025*
