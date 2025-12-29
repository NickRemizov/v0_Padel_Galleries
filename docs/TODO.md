# TODO

**Последнее обновление:** 2025-12-29  
**Версия приложения:** v1.1.8

---

## Статус рефакторинга

### ✅ Завершено (Frontend)

| Компонент | Было строк | Модулей | Дата |
|-----------|------------|---------|------|
| `gallery-images-manager.tsx` | 1086 | 12 | 2025-12 |
| `person-gallery-dialog.tsx` | 830 | 12 | 2025-12-29 |
| `face-tagging-dialog.tsx` | ~900 | 11 | 2025-12 |
| `auto-recognition-dialog.tsx` | ~500 | 8 | 2025-12 |
| `unknown-faces-review-dialog.tsx` | ~500 | 8 | 2025-12 |
| `app/admin/actions/integrity.ts` | 926 | 7 | 2025-12-29 |
| `database-integrity-checker.tsx` | 785 | 10 | 2025-12-29 |

### 🔄 Очередь (Frontend) — Приоритет 1

| # | Файл | Строк | Приоритет | Статус |
|---|------|-------|-----------|--------|
| 1.3 | `components/ui/sidebar.tsx` | 727 | MEDIUM | ❌ TODO |
| 1.4 | `face-training-manager.tsx` | 726 | MEDIUM | ❌ TODO |
| 1.5 | `actions/people.ts` + `faces.ts` | 671+619 | MEDIUM | ❌ TODO |
| 1.6 | `image-lightbox.tsx` | 596 | LOW | ❌ TODO |

### 🔄 Очередь (Backend) — Приоритет 2

| # | Файл | Строк | Статус |
|---|------|-------|--------|
| 2.1 | `routers/admin/debug.py` | 596 | ❌ TODO |
| 2.2 | `routers/galleries.py` | 578 | ❌ TODO |
| 2.3 | `services/training_service.py` | 540 | ❌ TODO |
| 2.4 | `services/face_recognition.py` | 514 | ❌ TODO |
| 2.5 | `routers/recognition/descriptors.py` | 447 | ❌ TODO |

---

## Следующая задача

**Рекомендуется:** `components/ui/sidebar.tsx` (727 строк)

Конфиг меню + рендер + состояние смешаны.

**Детальное ТЗ:** см. `docs/REFACTORING_SPEC.md`

---

## Структура отрефакторенных модулей

\`\`\`
app/admin/actions/
├── integrity/                # 7 modules
│   ├── index.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── utils.ts
│   ├── check-integrity.ts
│   ├── fix-integrity.ts
│   └── face-actions.ts
│
└── integrity.ts              # Реэкспорт

components/admin/
├── database-integrity/       # 10 modules
│   ├── DatabaseIntegrityChecker.tsx
│   ├── types.ts
│   ├── index.ts
│   ├── hooks/
│   │   ├── useIntegrityChecker.ts
│   │   └── index.ts
│   ├── components/
│   │   ├── IntegrityRunControls.tsx
│   │   ├── IntegritySummary.tsx
│   │   ├── IntegrityIssueRow.tsx
│   │   ├── IntegrityFaceCard.tsx
│   │   ├── PeopleWithoutFacesRow.tsx
│   │   └── index.ts
│   └── utils/
│       ├── helpers.ts
│       └── index.ts
│
├── database-integrity-checker.tsx  # Реэкспорт
├── gallery-images/           # 12 modules
├── person-gallery/           # 12 modules
├── face-tagging/             # 11 modules
├── auto-recognition/         # 8 modules
└── unknown-faces-review/     # 8 modules
\`\`\`

---

## Исправленные баги

### ✅ Unicode escapes в UI
- **Проблема:** Вместо кириллицы отображались `\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430`
- **Причина:** Файлы сохранялись с escaped Unicode вместо UTF-8
- **Решение:** Заменены все Unicode escapes на кириллицу
- **Версия:** v1.1.6

### ✅ Build-time API calls
- **Проблема:** Next.js 16 вызывал API во время сборки
- **Решение:** `isBuildPhase()` в apiClient.ts возвращает пустые данные
- **Версия:** v1.1.4

### ✅ Медленный UI в person-gallery
- **Проблема:** При удалении фото UI тормозил
- **Решение:** React.memo + useMemo + stable callbacks
- **Версия:** v1.1.3

---

## Правила

1. **Версионирование:** bump `lib/version.ts` при каждом коммите с кодом
2. **Unicode:** все русские строки — кириллицей
3. **API:** сначала backend → потом frontend
4. **Рефакторинг:** думать → делать → проверять

---

## Ссылки

- [REFACTORING_SPEC.md](./REFACTORING_SPEC.md) — детальное ТЗ
- [FRONTEND_REFACTORING_BRIEF.md](./FRONTEND_REFACTORING_BRIEF.md) — методология
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — контекст проекта
