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

### Фаза 1: Миграция Backend на SupabaseService ✅
- [x] 1.1 Обновить main.py — заменить старые импорты
- [x] 1.2 Обновить инъекцию в роутеры (теперь получают SupabaseService)
- [x] 1.3 Добавить backward compatibility в SupabaseService
- [x] 1.4 Обновить FaceRecognitionService v4.1
- [x] 1.5 Обновить TrainingService v4.1

**Коммиты:**
- `e1a0548` - main.py + SupabaseService backward compat
- `747eff3` - FaceRecognitionService + TrainingService

### Фаза 2: Удаление старых файлов 🔄
- [ ] 2.1 Удалить `services/supabase_client.py`
- [ ] 2.2 Удалить `services/supabase_database.py`
- [ ] 2.3 Перезапустить backend и проверить

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

## Архитектура после Фазы 1

```
main.py
  └── SupabaseService (singleton)
        ├── .client          → raw Supabase client
        ├── .config          → ConfigRepository
        ├── .embeddings      → EmbeddingsRepository  
        ├── .training        → TrainingRepository
        ├── .faces           → FacesRepository
        └── .people          → PeopleRepository
        
  └── FaceRecognitionService
        └── uses SupabaseService.embeddings, .config
        
  └── TrainingService
        └── uses SupabaseService.training, .faces

Роутеры получают SupabaseService и вызывают методы через
backward compatibility layer (делегирует в репозитории)
```

---

## Критерии завершения

- [x] Backend использует только `SupabaseService`
- [ ] Удалены файлы `supabase_client.py` и `supabase_database.py` (-54KB)
- [ ] Все P0 баги исправлены
- [ ] Backend запускается и проходит smoke test
