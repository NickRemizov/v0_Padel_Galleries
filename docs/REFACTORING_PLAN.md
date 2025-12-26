# План рефакторинга: Supabase Migration + P0 Fixes

**Дата создания:** 2024-12-26  
**Статус:** ✅ ЗАВЕРШЕНО  
**Последнее обновление:** 2024-12-26

---

## Проблема

1. **Дублирование кода:** Существовали две параллельные структуры для работы с Supabase:
   - Старые монолитные файлы: `supabase_client.py` (27KB), `supabase_database.py` (27KB) — **УДАЛЕНЫ**
   - Новая модульная структура: `services/supabase/` (6 модулей) — **АКТИВНА**
   
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

### Фаза 2: Удаление старых файлов ✅
- [x] 2.1 Удалены `services/supabase_client.py` (-27KB)
- [x] 2.2 Удалены `services/supabase_database.py` (-27KB)
- [x] 2.3 Обновлён `services/__init__.py` — удалены экспорты старых классов

**Коммит:** `80ebf47`

### Фаза 2.1: Исправление await на sync методах ✅
- [x] `routers/recognition/detect.py` — убран await с get_recognition_config()
- [x] `routers/training.py` — убраны await с get_recognition_config(), update_recognition_config()

**Коммиты:**
- `670bed3` - detect.py
- `ace8031` - training.py

### Фаза 2.2: Обновление импортов в роутерах ✅
После удаления старых файлов некоторые роутеры продолжали импортировать SupabaseDatabase:

- [x] `routers/admin/__init__.py` — обновлён импорт на SupabaseService
- [x] `routers/people/__init__.py` — обновлён импорт на SupabaseService
- [x] `routers/galleries.py` — обновлён импорт на SupabaseService
- [x] `routers/images.py` — обновлён импорт на SupabaseService

**Коммиты:**
- `e6890a6` - admin/__init__.py
- `2066e47` - people/__init__.py
- `f516af0` - galleries.py + images.py

### Фаза 3: Исправление P0 багов ✅

#### P0.6 — Route matching ✅ (уже было исправлено ранее)
- Все роуты используют `/{identifier:uuid}` вместо `/{identifier}`
- Статические пути типа `/consistency-audit` объявлены ДО динамических

#### P0.5 — rebuild-index proxy ✅
- Исправлен путь: `/rebuild-index` → `/api/recognition/rebuild-index`
- Добавлена обработка ApiResponse envelope

**Коммит:** `a65d69b`

#### P0.1-P0.3 — ApiResponse на фронте ✅
- `app/admin/actions/faces.ts` уже корректно читает из `result.data`

---

## Архитектура после рефакторинга

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

## Тестовые эндпоинты

### Admin Debug эндпоинты
| Эндпоинт | Метод | Описание |
|----------|-------|----------|
| `/api/admin/debug-gallery` | GET | Список галерей с проблемами |
| `/api/admin/debug-gallery?id={uuid}` | GET | Детальная диагностика галереи |
| `/api/admin/debug-gallery?id={uuid}&fix=true` | GET | Автофикс has_been_processed |
| `/api/admin/debug-photo?photo_id={uuid}` | GET | Диагностика фото и его лиц |
| `/api/admin/debug-person?person_id={uuid}` | GET | Диагностика эмбеддингов человека |
| `/api/admin/debug-recognition?face_id={uuid}` | GET | Тест распознавания для лица |
| `/api/admin/fix-person-confidence?person_id={uuid}` | POST | Фикс confidence для verified лиц |

### Recognition эндпоинты
| Эндпоинт | Метод | Описание |
|----------|-------|----------|
| `/api/recognition/rebuild-index` | POST | Пересобрать HNSW индекс |
| `/api/recognition/index-status` | GET | Статус индекса в памяти |
| `/api/recognition/index-debug-person?person_id={uuid}` | GET | Данные человека в индексе |
| `/api/recognition/detect-faces` | POST | Детекция лиц на фото |
| `/api/recognition/process-photo` | POST | Полная обработка фото |
| `/api/recognition/recognize-face` | POST | Распознать одно лицо |
| `/api/recognition/cluster-unknown-faces` | POST | Кластеризация неизвестных |

### People эндпоинты
| Эндпоинт | Метод | Описание |
|----------|-------|----------|
| `/api/people/consistency-audit` | GET | Аудит консистентности всех людей |
| `/api/people/{uuid}/embedding-consistency` | GET | Консистентность эмбеддингов человека |
| `/api/people/{uuid}/photos` | GET | Фото с человеком |
| `/api/people/{uuid}/photos-with-details` | GET | Детальная информация о фото |

### Health & Status
| Эндпоинт | Метод | Описание |
|----------|-------|----------|
| `/api/health` | GET | Статус сервиса |
| `/api/docs` | GET | Swagger документация |
| `/api/redoc` | GET | ReDoc документация |

---

## Примеры тестирования

```bash
# Health check
curl http://vlcpadel.com:8001/api/health

# Rebuild index
curl -X POST http://vlcpadel.com:8001/api/recognition/rebuild-index

# Index status
curl http://vlcpadel.com:8001/api/recognition/index-status

# Debug recognition для конкретного лица
curl "http://vlcpadel.com:8001/api/admin/debug-recognition?face_id=c73d6a77-9dbc-4257-a59d-9c473cb33390"

# Consistency audit
curl http://vlcpadel.com:8001/api/people/consistency-audit

# Debug person
curl "http://vlcpadel.com:8001/api/admin/debug-person?person_id={uuid}"
```

---

## Критерии завершения

- [x] Backend использует только `SupabaseService`
- [x] Удалены файлы `supabase_client.py` и `supabase_database.py` (-54KB)
- [x] Все P0 баги исправлены
- [x] Все роутеры обновлены на новые импорты
- [ ] Backend перезапущен и проходит smoke test

---

## Отложенные задачи (Фазы 4-5)

### Фаза 4: Миграция Frontend
Приоритет 1 — Админские write-операции:
- [ ] `app/admin/actions/people.ts`
- [ ] `app/admin/actions/cleanup.ts`
- [ ] `app/admin/actions/integrity.ts`

### Фаза 5: Унификация Response Envelope
- [ ] Recognition endpoints → ApiResponse
- [ ] Удаление костылей `result.data || result`

---

## Связанные документы

- `docs/01_P0-P1_findings.md` — Аудит P0/P1 проблем
- `docs/02_Unify_response_envelopes.md` — План унификации envelope
- `python/services/supabase/__init__.py` — SupabaseService с sync методами
