# План рефакторинга: Supabase Migration + P0 Fixes

**Дата создания:** 2024-12-26
**Статус:** 🔄 В РАБОТЕ

---

## Проблема

1. **Дублирование кода:** Существуют две параллельные структуры для работы с Supabase:
   - Старые монолитные файлы: `supabase_client.py` (27KB), `supabase_database.py` (27KB)
   - Новая модульная структура: `services/supabase/` (6 модулей)
   
2. **P0 баги из аудита:** Критические проблемы совместимости frontend ↔ backend

3. **Архитектурные нарушения:** 34 файла на фронте используют прямой Supabase

---

## Фазы выполнения

### Фаза 0: Подготовка ✅
- [x] Проверить что `services/supabase/` модули рабочие
- [x] Составить карту зависимостей
- [x] Убедиться что backend запускается

### Фаза 1: Миграция Backend на SupabaseService 🔄
- [ ] 1.1 Обновить main.py — заменить старые импорты
- [ ] 1.2 Обновить инъекцию в роутеры
- [ ] 1.3 Обновить роутеры (faces, people, recognition, admin, images, galleries)
- [ ] 1.4 Проверить FaceRecognitionService
- [ ] 1.5 Smoke test всех endpoints

### Фаза 2: Удаление старых файлов
- [ ] 2.1 Удалить `services/supabase_client.py`
- [ ] 2.2 Удалить `services/supabase_database.py`
- [ ] 2.3 Обновить импорты если нужно
- [ ] 2.4 Финальная проверка

### Фаза 3: Исправление P0 багов

#### P0.6 — Route matching (КРИТИЧНО)
- [ ] Изменить `/{identifier}` на `/{person_id:uuid}`
- [ ] Добавить отдельный путь `/slug/{slug}` если нужен

#### P0.5 — rebuild-index proxy
- [ ] Исправить путь в `app/api/recognition/rebuild-index/route.ts`

#### P0.1-P0.3 — ApiResponse на фронте
- [ ] `app/admin/actions/faces.ts` — читать из `result.data.*`
- [ ] Другие файлы по необходимости

### Фаза 4: Миграция Frontend (отложенная)
Приоритет 1 — Админские write-операции:
- [ ] `app/admin/actions/people.ts`
- [ ] `app/admin/actions/cleanup.ts`
- [ ] `app/admin/actions/integrity.ts`

### Фаза 5: Унификация Response Envelope (отложенная)
- [ ] Recognition endpoints → ApiResponse
- [ ] Удаление костылей `result.data || result`

---

## Текущий прогресс

### Фаза 1.1 — Анализ main.py

**Текущие импорты:**
```python
from services.supabase_database import SupabaseDatabase
from services.supabase_client import SupabaseClient
```

**Целевые импорты:**
```python
from services.supabase import SupabaseService
```

**Инъекция в роутеры (текущая):**
```python
supabase_db = SupabaseDatabase()
supabase_client = SupabaseClient()

faces.set_services(face_service, supabase_db)
recognition.set_services(face_service, supabase_client)
images.set_services(supabase_db, face_service)
people.set_services(supabase_db, face_service)
galleries.set_services(supabase_db, face_service)
admin.set_services(supabase_db, face_service)
# ...
```

---

## Связанные документы

- `docs/01_P0-P1_findings.md` — Аудит P0/P1 проблем
- `docs/02_Unify_response_envelopes.md` — План унификации envelope
- `python/services/supabase/__init__.py` — Новый SupabaseService

---

## Критерии завершения

- [ ] Backend использует только `SupabaseService`
- [ ] Удалены файлы `supabase_client.py` и `supabase_database.py` (-54KB)
- [ ] Все P0 баги исправлены
- [ ] Backend запускается и проходит smoke test
