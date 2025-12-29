# TODO

**Последнее обновление:** 2025-12-29  
**Версия приложения:** v1.1.11

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
| `face-training-manager.tsx` | 750 | 9 | 2025-12-29 |
| `actions/people.ts` | 670 | 6 | 2025-12-29 |
| `actions/faces.ts` | 520 | 5 | 2025-12-29 |
| `image-lightbox.tsx` | 600 | 8 | 2025-12-29 |

### ✅ Frontend рефакторинг завершён!

Все крупные frontend файлы (>500 строк) разбиты на модули.

### 🔄 Очередь (Backend) — Приоритет 2

| # | Файл | Строк | Статус |
|---|------|-------|--------|
| 2.1 | `routers/admin/debug.py` | 596 | ❌ TODO |
| 2.2 | `routers/galleries.py` | 578 | ❌ TODO |
| 2.3 | `services/training_service.py` | 540 | ❌ TODO |
| 2.4 | `services/face_recognition.py` | 514 | ❌ TODO |
| 2.5 | `routers/recognition/descriptors.py` | 447 | ❌ TODO |

---

## Структура отрефакторенных модулей

\`\`\`
app/admin/actions/
├── integrity/                # 7 modules
├── people/                   # 6 modules
├── faces/                    # 5 modules
├── integrity.ts              # Реэкспорт
├── people.ts                 # Реэкспорт
└── faces.ts                  # Реэкспорт

components/
├── image-lightbox/           # 8 modules
│   ├── ImageLightbox.tsx
│   ├── types.ts
│   ├── index.ts
│   ├── hooks/
│   │   ├── useLightboxState.ts
│   │   └── useSwipeNavigation.ts
│   ├── utils/
│   │   └── formatters.ts
│   └── components/
│       ├── LightboxToolbar.tsx
│       ├── NavigationButtons.tsx
│       ├── PhotoCounter.tsx
│       ├── PeopleLinks.tsx
│       ├── FileInfoBar.tsx
│       └── CommentsPanel.tsx
│
├── image-lightbox.tsx        # Реэкспорт
│
└── admin/
    ├── database-integrity/   # 10 modules
    ├── face-training/        # 9 modules
    ├── gallery-images/       # 12 modules
    ├── person-gallery/       # 12 modules
    ├── face-tagging/         # 11 modules
    ├── auto-recognition/     # 8 modules
    └── unknown-faces-review/ # 8 modules
\`\`\`

---

## Исправленные баги

### ✅ Unicode escapes в UI
- **Проблема:** Вместо кириллицы отображались `\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430`
- **Решение:** Заменены все Unicode escapes на кириллицу

### ✅ Build-time API calls
- **Проблема:** Next.js 16 вызывал API во время сборки
- **Решение:** `isBuildPhase()` в apiClient.ts

### ✅ Training auth headers
- **Проблема:** "Not authenticated" при сохранении настроек
- **Решение:** Добавлены auth headers во все training routes

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
