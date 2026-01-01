# ТЗ для продолжения работы

**Дата:** 2025-01-01  
**Версия:** v1.1.18  
**Репозиторий:** NickRemizov/v0_Padel_Galleries

---

## ✅ ВЫПОЛНЕНО

### 1. Аудит кодовой базы
- Полный аудит v0 export завершён
- Верифицирован против GitHub

### 2. P0 баги исправлены
- **P0-1:** `confidence` → `recognition_confidence` в `app/admin/actions/debug.ts`
- **P0-2:** ApiResponse parsing в `global-unknown-faces-dialog.tsx`

### 3. Документация обновлена
- `KNOWN_ISSUES.md` — финализирован
- Admin actions на frontend оставлены сознательно (owner decision)

### 4. Рефакторинг больших файлов ✅ ЗАВЕРШЕН

| Файл | Было | Стало | Статус |
|------|------|--------|--------|
| `training-stats-card.tsx` | 1 файл | 10 файлов | ✅ |
| `batch-recognition-dialog.tsx` | 1 файл | 4 файла | ✅ |
| `consistency-audit-dialog.tsx` | 11KB | 7.5KB + hook | ✅ |
| `service-manager/` | папка | 5 файлов | ✅ |
| `global-unknown-faces-dialog.tsx` | 16KB | 5 модулей | ✅ |
| `duplicate-people-dialog.tsx` | 17KB | 6 модулей | ✅ |

---

## ❗ ТРЕБУЕТ РУЧНОГО УДАЛЕНИЯ

### Dead code cleanup (одобрено owner)
Файлы с 0 импортов - удалить вручную через GitHub UI или git:

\`\`\`bash
git rm lib/debounce.ts
git rm lib/supabase/client.ts
git rm lib/supabase/safe-call.ts  
git rm lib/supabase/with-supabase.ts
git rm python/routers/config.py
git commit -m "chore: remove dead code files"
git push
\`\`\`

---

## АРХИТЕКТУРНЫЕ РЕШЕНИЯ (уже задокументированы)

1. **Admin actions на frontend** — оставлены сознательно, редко используются
2. **Social layer** — comments/likes/favorites остаются в Next.js
3. **Unused API routes** — задокументированы в KNOWN_ISSUES.md, решение отложено

---

## ПРОВЕРКА ПОСЛЕ РЕФАКТОРИНГА

\`\`\`bash
npm run build
\`\`\`

Если сборка прошла — импорты работают.

---

## ССЫЛКИ

- **KNOWN_ISSUES.md** — текущее состояние тех. долга
- **AI_HANDOFF_RECOMMENDATIONS.md** — результаты аудита
