# TODO

## Performance Issues

### ✅ FIXED: Медленное отображение удаления в галерее игроков (person-gallery-dialog)
- **Файл:** `components/admin/person-gallery/`
- **Проблема:** При удалении игрока с фото UI обновлялся медленно
- **Причины:** React re-render всего grid, пересчёт calculateFaceStyles для всех фото
- **Решение:**
  1. ✅ React.memo на PersonGalleryPhotoCard - карточка перерисовывается только при изменении своих props
  2. ✅ useMemo для calculateFaceStyles внутри карточки - зависит только от bbox/width/height
  3. ✅ Stable callbacks через useCallback в PhotosList - предотвращает лишние рендеры
  4. ✅ Optimistic updates уже были (удаление из state до API call)
- **Статус:** FIXED

## Refactoring Queue

Согласно docs/FRONTEND_REFACTORING_BRIEF.md:

### Frontend - По плану
| # | Файл | Строк | Статус |
|---|------|-------|--------|
| 3.1 | `gallery-images-manager.tsx` | 1086 | ✅ DONE (12 модулей) |
| 3.2 | `integrity.ts` | 926 | ❌ TODO |
| 3.3 | `person-gallery-dialog.tsx` | 830 | ✅ DONE (12 модулей) + perf fix |
| 3.4 | `database-integrity-checker.tsx` | 785 | ❌ TODO |
| 3.5 | `sidebar.tsx` | 727 | ❌ TODO |
| 3.6 | `face-training-manager.tsx` | 726 | ❌ TODO |
| 3.7 | `people.ts` / `faces.ts` | 671/619 | ❌ TODO |
| 3.8 | `image-lightbox.tsx` | 596 | ❌ TODO |

### Backend - По плану
| # | Файл | Строк | Статус |
|---|------|-------|--------|
| 3.9 | `debug.py` | 596 | ❌ TODO |
| 3.10 | `galleries.py` | 578 | ❌ TODO |
| 3.11 | `training_service.py` | 540 | ❌ TODO |
| 3.12 | `face_recognition.py` | 514 | ❌ TODO |
| 3.13 | `descriptors.py` | 447 | ❌ TODO |

### Дополнительно сделано (не в плане)
- ✅ `face-tagging-dialog.tsx` (33KB → 11 модулей)
- ✅ `auto-recognition-dialog.tsx` (16KB → 8 модулей)
- ✅ `unknown-faces-review-dialog.tsx` (15KB → 8 модулей)

## Refactored Structure Summary

\`\`\`
components/admin/
├── gallery-images/           # 12 modules
├── face-tagging/             # 11 modules
├── auto-recognition/         # 8 modules
├── unknown-faces-review/     # 8 modules
└── person-gallery/           # 12 modules (NEW)
    ├── types.ts
    ├── utils/ (face-styles, sorting)
    ├── hooks/ (usePersonGallery, usePhotoSelection, usePhotoNavigation)
    └── components/ (Header, PhotosList, PhotoCard[memo], Footer, dialogs/)
\`\`\`
