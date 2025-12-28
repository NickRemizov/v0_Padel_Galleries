# TODO

## Performance Issues

### Медленное отображение удаления в галерее игроков (person-gallery-dialog)
- **Файл:** `components/admin/person-gallery-dialog.tsx`
- **Проблема:** При удалении игрока с фото UI обновляется медленно, несмотря на optimistic update
- **Симптом:** Пользователь нажимает удалить → задержка ~1-2сек → фото исчезает
- **Возможные причины:**
  1. Тяжёлые вычисления в useMemo (sortedPhotos) при изменении photos - пересчёт для всех фото
  2. Пересчёт calculateFaceStyles для каждого фото при любом изменении массива
  3. Batch delete: N последовательных API вызовов вместо одного batch-запроса
  4. React re-render всего grid при изменении одного элемента
- **Предлагаемые решения:**
  1. Мемоизация calculateFaceStyles через useMemo с зависимостью от конкретного фото
  2. Виртуализация списка (react-window) для больших галерей
  3. Batch API endpoint для удаления нескольких фото одним запросом
  4. React.memo для карточек фото с правильными зависимостями
- **Приоритет:** HIGH (влияет на UX)

## Refactoring Queue

Согласно docs/FRONTEND_REFACTORING_BRIEF.md:

### Frontend - DONE ✅
1. ✅ `gallery-images-manager.tsx` (39KB → 12 модулей)
2. ✅ `face-tagging-dialog.tsx` (33KB → 11 модулей)
3. ✅ `auto-recognition-dialog.tsx` (16KB → 8 модулей)
4. ✅ `unknown-faces-review-dialog.tsx` (15KB → 8 модулей)

### Backend - TODO
5. `integrity.ts` (926 lines)
6. `galleries.py` (578 lines)

## Refactored Structure Summary

```
components/admin/
├── gallery-images/           # 12 modules
│   ├── types.ts
│   ├── hooks/ (useGalleryData, useGallerySelection, useImageActions)
│   └── components/ (Toolbar, ImageGrid, ImageCard, etc.)
│
├── face-tagging/             # 11 modules
│   ├── types.ts
│   ├── utils/ (canvas-helpers, file-helpers)
│   ├── hooks/ (useFaceCanvas, useFaceAPI, useKeyboardShortcuts)
│   └── components/ (Toolbar, Canvas, Badges, PersonSelector, Footer)
│
├── auto-recognition/         # 8 modules
│   ├── types.ts
│   ├── hooks/ (useAutoRecognition)
│   └── components/ (Progress, Results, ResultItem)
│
└── unknown-faces-review/     # 8 modules
    ├── types.ts
    ├── utils.ts
    ├── hooks/ (useClusterReview)
    └── components/ (FaceCard, Grid, Actions)
```
