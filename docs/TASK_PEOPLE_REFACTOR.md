# ТЗ: Рефакторинг people.py

> **Создано:** 23 декабря 2025
> **Приоритет:** HIGH
> **Оценка:** 2-3 часа

---

## Контекст

В предыдущей сессии выполнен рефакторинг `faces.py` (1031 строка → 6 модулей).
Теперь нужно аналогично разбить `people.py` (~1200 строк).

**Образец:** `python/routers/faces/`

---

## Что прочитать СНАЧАЛА

1. **Структура faces/ как образец:**
   ```
   python/routers/faces/
   ├── __init__.py           (50 строк)  - router export, set_services
   ├── models.py             (58 строк)  - Pydantic models
   ├── crud.py               (260 строк) - get, save, update, delete
   ├── batch_operations.py   (302 строк) - batch-verify, batch-assign, batch-save
   ├── recognition.py        (392 строк) - recognize-unknown, clear-descriptor, set-excluded
   └── statistics.py         (96 строк)  - /statistics endpoint
   ```

2. **Текущий people.py:** `python/routers/people.py` (~45KB)

3. **main.py:** `python/main.py` — как вызывается `set_services()`

---

## Правила рефакторинга

### Лимиты
- **Максимум 400-500 строк** на файл
- Если модуль > 500 строк — разбить дальше

### Архитектура
```python
# __init__.py
face_service_instance = None
supabase_db_instance = None

def set_services(face_service, supabase_db):
    global face_service_instance, supabase_db_instance
    face_service_instance = face_service
    supabase_db_instance = supabase_db

# Импорт ПОСЛЕ определения глобалов
from .crud import router as crud_router
router.include_router(crud_router)
```

```python
# В каждом модуле
def get_face_service():
    from . import face_service_instance
    return face_service_instance

def get_supabase_db():
    from . import supabase_db_instance
    return supabase_db_instance
```

### Импорты
- Относительные: `from .models import PersonCreate`
- Из пакета: `from . import face_service_instance`

---

## План разбивки people.py

```
python/routers/people/
├── __init__.py           # router export, set_services, глобалы
├── models.py             # Pydantic Request/Response models
├── crud.py               # GET /people, GET /{id}, POST, PUT, DELETE
├── photos.py             # /{id}/photos, /{id}/photo-faces
├── avatar.py             # /{id}/avatar, /auto-avatar
├── consistency.py        # /consistency-audit, /{id}/embedding-consistency
├── outliers.py           # /{id}/clear-outliers, /audit-all-embeddings
└── search.py             # /search, /suggestions (если есть)
```

### Примерное распределение эндпоинтов

**crud.py:**
- `GET /` — список людей
- `GET /{id}` — один человек
- `POST /` — создать
- `PUT /{id}` — обновить
- `DELETE /{id}` — удалить

**photos.py:**
- `GET /{id}/photos` — фото человека
- `GET /{id}/photo-faces` — лица на фото

**avatar.py:**
- `POST /{id}/avatar` — загрузить аватар
- `POST /auto-avatar` — автоматически создать аватар

**consistency.py:**
- `GET /consistency-audit` — аудит всех
- `GET /{id}/embedding-consistency` — детали эмбеддингов

**outliers.py:**
- `POST /{id}/clear-outliers` — исключить outliers
- `POST /audit-all-embeddings` — массовое исправление

---

## Workflow

1. **Получить файл:**
   ```
   github:get_file_contents → python/routers/people.py
   ```

2. **Создать модули локально:**
   ```
   /home/claude/people/
   ├── __init__.py
   ├── models.py
   ├── crud.py
   └── ...
   ```

3. **Проверить размеры:**
   ```bash
   wc -l /home/claude/people/*.py
   ```

4. **Пушить одним коммитом:**
   ```
   github:push_files → python/routers/people/
   ```

5. **Владелец удаляет старый файл:**
   ```
   python/routers/people.py → DELETE
   ```

6. **Рестарт сервиса:**
   ```bash
   sudo systemctl restart padel-recognition
   ```

---

## Критичные знания

### Сервисы
- **Backend URL:** http://vlcpadel.com:8001
- **GitHub repo:** NickRemizov/v0_Padel_Galleries
- **Branch:** main

### Ограничения
- GitHub API не может удалять файлы — владелец делает вручную
- Python предпочитает папку над файлом при импорте

### main.py не меняется
```python
from routers import people
people.set_services(supabase_db, face_service)
app.include_router(people.router, prefix="/api/people")
```

---

## После people.py

Следующие файлы для рефакторинга:

| Файл | Размер | Приоритет |
|------|--------|-----------|
| `admin.py` | ~800 строк | HIGH |
| `supabase_client.py` | ~700 строк | MEDIUM |
| `supabase_database.py` | ~700 строк | MEDIUM |

Frontend компоненты — в отдельных сессиях.

---

## Связанные документы

- `docs/ROADMAP.md` — общий план
- `docs/DATABASE_SCHEMA.md` — схема БД
- `docs/RECOGNITION_SUMMARY.md` — распознавание
- `python/routers/faces/` — образец рефакторинга
