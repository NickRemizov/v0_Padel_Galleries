# Техническое задание: Рефакторинг монолитных файлов

**Версия:** 1.0  
**Дата:** 2025-12-29  
**Текущая версия приложения:** v1.1.6

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

## Что уже сделано

### Frontend (5 модулей разбито)

| Компонент | Было | Стало | Модулей |
|-----------|------|-------|--------|
| `gallery-images-manager.tsx` | 1086 строк | `gallery-images/` | 12 |
| `person-gallery-dialog.tsx` | 830 строк | `person-gallery/` | 12 |
| `face-tagging-dialog.tsx` | ~900 строк | `face-tagging/` | 11 |
| `auto-recognition-dialog.tsx` | ~500 строк | `auto-recognition/` | 8 |
| `unknown-faces-review-dialog.tsx` | ~500 строк | `unknown-faces-review/` | 8 |

### Паттерн рефакторинга (проверенный)

\`\`\`
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
\`\`\`

---

## Очередь рефакторинга

### Приоритет 1: Frontend (большие файлы)

#### 1.1 `app/admin/actions/integrity.ts` — 926 строк
**Проблема:** Монолит проверок целостности БД.  
**Решение:**
\`\`\`
app/admin/actions/integrity/
├── index.ts              # Экспорты
├── types.ts              # IntegrityResult, CheckResult
├── runner.ts             # Общий runner проверок
├── checks/
│   ├── peopleChecks.ts   # Проверки людей
│   ├── facesChecks.ts    # Проверки лиц
│   ├── galleriesChecks.ts
│   ├── configChecks.ts
│   └── index.ts
└── utils/
    ├── normalize.ts      # Нормализация ошибок
    └── severity.ts       # Уровни severity
\`\`\`

#### 1.2 `components/admin/database-integrity-checker.tsx` — 785 строк
**Проблема:** UI + логика + прогресс + результаты в одном файле.  
**Решение:**
\`\`\`
components/admin/database-integrity/
├── DatabaseIntegrityChecker.tsx  # Контейнер
├── types.ts
├── hooks/
│   └── useIntegrityRunner.ts     # Запуск проверок, прогресс
├── components/
│   ├── IntegrityRunControls.tsx  # Кнопки запуска
│   ├── IntegritySummary.tsx      # Сводка результатов
│   ├── IntegrityResultsTable.tsx # Таблица результатов
│   └── IntegrityResultDetails.tsx # Детали ошибки
└── index.ts
\`\`\`

#### 1.3 `components/ui/sidebar.tsx` — 727 строк
**Проблема:** Конфиг меню + рендер + состояние смешаны.  
**Решение:**
\`\`\`
components/ui/sidebar/
├── Sidebar.tsx           # Главный компонент
├── types.ts
├── config.ts             # Структура меню (data)
├── hooks/
│   └── useSidebarState.ts # Сворачивание, active route
├── components/
│   ├── SidebarGroup.tsx
│   ├── SidebarItem.tsx
│   ├── SidebarHeader.tsx
│   └── SidebarFooter.tsx
└── index.ts
\`\`\`

#### 1.4 `components/admin/face-training-manager.tsx` — 726 строк
**Проблема:** Запуск тренировки + статусы + история + polling.  
**Решение:**
\`\`\`
components/admin/face-training/
├── FaceTrainingManager.tsx
├── types.ts
├── hooks/
│   ├── useTrainingSessions.ts  # Список/история
│   └── useTrainingStatus.ts    # Polling статуса
├── components/
│   ├── TrainingControls.tsx
│   ├── TrainingHistory.tsx
│   └── TrainingStatusPanel.tsx
└── index.ts
\`\`\`

#### 1.5 `app/admin/actions/people.ts` — 671 строк + `faces.ts` — 619 строк
**Проблема:** Слишком много actions в одном файле.  
**Решение:**
\`\`\`
app/admin/actions/
├── people/
│   ├── search.ts
│   ├── crud.ts
│   ├── merge.ts
│   └── index.ts
├── faces/
│   ├── save.ts
│   ├── batch.ts
│   ├── verify.ts
│   └── index.ts
\`\`\`

#### 1.6 `components/image-lightbox.tsx` — 596 строк
**Проблема:** Навигация + рендер тегов + keyboard handling.  
**Решение:**
\`\`\`
components/lightbox/
├── ImageLightbox.tsx
├── types.ts
├── hooks/
│   ├── useLightboxNavigation.ts
│   └── useLightboxKeyboard.ts
├── components/
│   ├── LightboxHeader.tsx
│   ├── LightboxStage.tsx
│   ├── LightboxSidebar.tsx
│   └── PeopleTagsOverlay.tsx
└── index.ts
\`\`\`

### Приоритет 2: Backend (Python)

#### 2.1 `python/routers/admin/debug.py` — 596 строк
\`\`\`
python/routers/admin/debug/
├── __init__.py           # Сборка роутеров
├── debug_gallery.py
├── debug_faces.py
└── debug_db.py
\`\`\`

#### 2.2 `python/routers/galleries.py` — 578 строк
\`\`\`
python/routers/galleries/
├── __init__.py
├── read.py               # GET list/detail
├── admin.py              # Admin operations
└── assembler.py          # Сборка "full view"
\`\`\`

#### 2.3 `python/services/training_service.py` — 540 строк
\`\`\`
python/services/training/
├── __init__.py
├── session.py            # Жизненный цикл сессии
├── pipeline.py           # Шаги пайплайна
├── storage.py            # Статус/история
└── models.py             # Структуры
\`\`\`

#### 2.4 `python/services/face_recognition.py` — 514 строк
\`\`\`
python/services/recognition/
├── __init__.py
├── detector.py           # ML: детект + эмбеддинг
├── processor.py          # Постпроцесс: thresholds, clustering
└── persistence.py        # Запись результатов
\`\`\`

#### 2.5 `python/routers/recognition/descriptors.py` — 447 строк
\`\`\`
python/routers/recognition/
├── descriptors_endpoints.py  # Endpoints
└── descriptors_service.py    # Логика
\`\`\`

---

## Правила работы

### Обязательно

1. **Думать → Делать → Проверять**
   - Перед изменением: понять что меняем и почему
   - После изменения: проверить что работает
   - Время владельца дороже переделок

2. **Версионирование**
   - При каждом коммите с кодом: bump version в `lib/version.ts`
   - Формат: patch (1.1.6 → 1.1.7)

3. **Точечные правки**
   - Если меняется <50% файла → `str_replace`
   - Если меняется >50% или новый файл → перезапись целиком

4. **API интеграция**
   - СНАЧАЛА показать поля backend ответа
   - ПОТОМ писать frontend код
   - Сверять названия полей БУКВАЛЬНО

5. **Unicode**
   - Все русские строки — кириллицей, НЕ Unicode escapes
   - Проверять ВСЕ файлы модуля перед коммитом

### Методология рефакторинга (7 шагов)

1. Создать структуру папок
2. Вынести types.ts
3. Вынести utils/
4. Вынести hooks/
5. Вынести components/
6. Собрать главный компонент
7. Обновить импорты во всём проекте

### После каждого рефакторинга

- [ ] Проверить сборку: `npm run build`
- [ ] Проверить типы: `npm run typecheck`
- [ ] Функциональный тест в браузере
- [ ] Обновить docs/TODO.md

---

## Команды

\`\`\`bash
# Сборка frontend
npm run build

# Проверка типов
npm run typecheck

# Рестарт backend
/home/nickr/scripts/run.sh

# Логи backend
journalctl -u padel-api -f
\`\`\`

---

## Критерии готовности

**Модуль считается отрефакторенным когда:**

1. ✅ Исходный файл заменён на папку с модулями
2. ✅ Каждый файл < 300 строк
3. ✅ Типы вынесены в types.ts
4. ✅ Хуки отделены от UI
5. ✅ Сборка проходит без ошибок
6. ✅ Функционал работает как раньше
7. ✅ TODO.md обновлён
