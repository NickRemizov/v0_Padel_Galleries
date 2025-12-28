# TODO

## Performance Issues

### Медленное отображение удаления в галерее игроков
- **Файл:** `components/admin/person-gallery-dialog.tsx`
- **Проблема:** При удалении игрока с фото UI обновляется медленно, несмотря на optimistic update
- **Возможные причины:**
  - Тяжёлые вычисления в useMemo (sortedPhotos) при изменении photos
  - Пересчёт calculateFaceStyles для всех фото при любом изменении
  - Много API вызовов при batch delete (последовательно, не параллельно)
- **Решение:** Требует детального профилирования и оптимизации

## Refactoring Queue

Согласно docs/FRONTEND_REFACTORING_BRIEF.md:

1. ✅ `gallery-images-manager.tsx` (39KB → 12 модулей) - DONE
2. ⏳ `face-tagging-dialog.tsx` (33KB, 830 lines) - IN PROGRESS
3. `auto-recognition-dialog.tsx`
4. `unknown-faces-review-dialog.tsx`
5. Backend: `integrity.ts` (926 lines), `galleries.py` (578 lines)
