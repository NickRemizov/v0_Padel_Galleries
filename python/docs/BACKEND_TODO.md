# Backend TODO

> **Обновлено:** 6 января 2026

---

## Технический долг

### 1. CORS: динамическая проверка origins

**Проблема:** `allow_origins=["*"]` + `allow_credentials=True` — небезопасно.

**Решение:** Кастомный CORS middleware с проверкой:
- Статический список разрешённых origins
- Динамические Vercel preview URLs (`*.vercel.app`)

### 2. DI: глобальные переменные вместо Depends

**Проблема:** Роутеры используют `set_services()` с глобальными переменными.

**Решение:** FastAPI `Depends()` + dependency container.

### 3. Async/Sync: блокирующие вызовы

**Проблема:** `async def` эндпоинты с синхронными вызовами Supabase.

**Решение:**
- Быстрый фикс: `asyncio.to_thread()`
- Правильный: Async Supabase клиент

### 4. Репозиторий БД: объединить классы

**Проблема:** `SupabaseClient` и `SupabaseDatabase` дублируют методы.

**Решение:** Единый Repository слой.

---

## Рефакторинг крупных файлов

| Файл | Строк | Статус |
|------|-------|--------|
| `routers/admin/debug.py` | 596 | TODO |
| `routers/galleries.py` | 578 | TODO |
| `services/training_service.py` | 540 | TODO |
| `services/face_recognition.py` | 514 | TODO |
