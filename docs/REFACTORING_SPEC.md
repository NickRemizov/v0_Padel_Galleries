# Техническое задание: Рефакторинг монолитных файлов

**Версия:** 2.0  
**Дата:** 2025-12-29  
**Текущая версия приложения:** v1.1.11

---

## Контекст проекта

**vlcpadel.com** — портал фото с турниров по паделю с AI-распознаванием лиц.

**Стек:**
- Frontend: Next.js 16, TypeScript, Tailwind, shadcn/ui
- Backend: FastAPI (Python), PostgreSQL
- ML: InsightFace Antelopev2

**Репозитории:**
- Frontend: `github.com/NickRemizov/v0_Padel_Galleries`
- Backend: `/home/nickr/python` на сервере (деплой через GitHub Actions)
- FastAPI URL: `http://vlcpadel.com:8001`

---

## ✅ Frontend рефакторинг ЗАВЕРШЁН

Все крупные файлы (>500 строк) разбиты на модули.

| Компонент | Было | Стало | Модулей | Дата |
|-----------|------|-------|--------|------|
| `gallery-images-manager.tsx` | 1086 | `gallery-images/` | 12 | 2025-12 |
| `face-tagging-dialog.tsx` | ~900 | `face-tagging/` | 11 | 2025-12 |
| `integrity.ts` | 926 | `integrity/` | 7 | 2025-12-29 |
| `person-gallery-dialog.tsx` | 830 | `person-gallery/` | 12 | 2025-12-29 |
| `database-integrity-checker.tsx` | 785 | `database-integrity/` | 10 | 2025-12-29 |
| `face-training-manager.tsx` | 750 | `face-training/` | 9 | 2025-12-29 |
| `people.ts` | 670 | `people/` | 6 | 2025-12-29 |
| `image-lightbox.tsx` | 600 | `image-lightbox/` | 8 | 2025-12-29 |
| `faces.ts` | 520 | `faces/` | 5 | 2025-12-29 |
| `auto-recognition-dialog.tsx` | ~500 | `auto-recognition/` | 8 | 2025-12 |
| `unknown-faces-review-dialog.tsx` | ~500 | `unknown-faces-review/` | 8 | 2025-12 |

**Итого:** ~8000 строк → 96 модулей

### Паттерн рефакторинга (проверенный)

```
components/admin/{module}/
├── {Module}Dialog.tsx      # Контейнер-оркестратор
├── types.ts                # Интерфейсы и типы
├── index.ts                # Экспорты
├── hooks/
│   ├── use{Module}Data.ts  # Загрузка данных
│   ├── use{Module}Actions.ts # Операции
│   └── index.ts
├── components/
│   ├── {Module}Header.tsx
│   ├── {Module}Content.tsx
│   ├── {Module}Footer.tsx
│   └── index.ts
└── utils/
    ├── helpers.ts
    └── index.ts
```

---

## 🔄 Очередь: Backend (Python)

| # | Файл | Строк | Статус |
|---|------|-------|--------|
| 2.1 | `routers/admin/debug.py` | 596 | ❌ TODO |
| 2.2 | `routers/galleries.py` | 578 | ❌ TODO |
| 2.3 | `services/training_service.py` | 540 | ❌ TODO |
| 2.4 | `services/face_recognition.py` | 514 | ❌ TODO |
| 2.5 | `routers/recognition/descriptors.py` | 447 | ❌ TODO |

### План разбиения Backend

#### 2.1 `python/routers/admin/debug.py` → debug/
```
python/routers/admin/debug/
├── __init__.py           # Сборка роутеров
├── debug_gallery.py
├── debug_faces.py
└── debug_db.py
```

#### 2.2 `python/routers/galleries.py` → galleries/
```
python/routers/galleries/
├── __init__.py
├── read.py               # GET list/detail
├── admin.py              # Admin operations
└── assembler.py          # Сборка "full view"
```

#### 2.3 `python/services/training_service.py` → training/
```
python/services/training/
├── __init__.py
├── session.py            # Жизненный цикл сессии
├── pipeline.py           # Шаги пайплайна
├── storage.py            # Статус/история
└── models.py             # Структуры
```

#### 2.4 `python/services/face_recognition.py` → recognition/
```
python/services/recognition/
├── __init__.py
├── detector.py           # ML: детект + эмбеддинг
├── processor.py          # Постпроцесс: thresholds, clustering
└── persistence.py        # Запись результатов
```

#### 2.5 `python/routers/recognition/descriptors.py` → разделение
```
python/routers/recognition/
├── descriptors_endpoints.py  # Endpoints
└── descriptors_service.py    # Логика
```

---

## Правила работы

### Обязательно

1. **Думать → Делать → Проверять**
   - Перед изменением: понять что меняем и почему
   - После изменения: проверить что работает

2. **Версионирование**
   - При каждом коммите с кодом: bump version в `lib/version.ts`

3. **Точечные правки**
   - Если меняется <50% файла → `str_replace`
   - Если меняется >50% или новый файл → перезапись целиком

4. **API интеграция**
   - СНАЧАЛА показать поля backend ответа
   - ПОТОМ писать frontend код

5. **Unicode**
   - Все русские строки — кириллицей, НЕ Unicode escapes

### Методология рефакторинга (7 шагов)

1. Создать структуру папок
2. Вынести types.ts
3. Вынести utils/
4. Вынести hooks/
5. Вынести components/
6. Собрать главный компонент
7. Старый файл → реэкспорт из модуля

---

## Команды

```bash
# Сборка frontend
npm run build

# Проверка типов
npm run typecheck

# Рестарт backend
/home/nickr/scripts/run.sh

# Логи backend
journalctl -u padel-api -f
```

---

## Критерии готовности

**Модуль считается отрефакторенным когда:**

1. ✅ Исходный файл заменён на реэкспорт
2. ✅ Каждый файл < 300 строк
3. ✅ Типы вынесены в types.ts
4. ✅ Хуки отделены от UI
5. ✅ Сборка проходит без ошибок
6. ✅ Функционал работает как раньше
7. ✅ TODO.md обновлён
