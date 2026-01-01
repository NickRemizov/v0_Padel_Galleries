# ТЗ для продолжения работы

**Дата:** 2025-12-31  
**Версия:** v1.1.17  
**Репозиторий:** NickRemizov/v0_Padel_Galleries

---

## ✅ ВЫПОЛНЕНО

### 1. Аудит кодовой базы
- Полный аудит v0 export завершён
- Верифицирован против GitHub

### 2. P0 баги исправлены
- **P0-1:** `confidence` → `recognition_confidence` в `app/admin/actions/debug.ts` (коммит `97205d7`)
- **P0-2:** ApiResponse parsing в `global-unknown-faces-dialog.tsx` (коммит `2b9b5e2`)

### 3. Документация обновлена
- `KNOWN_ISSUES.md` — финализирован (коммит `8b5154a`)
- Admin actions на frontend оставлены сознательно (owner decision)

### 4. Рефакторинг больших файлов (ЧАСТИЧНО)
Разбиты на модули:
- `training-stats-card.tsx` → папка `training-stats/` (10 файлов, все <6KB) ✅
- `batch-recognition-dialog.tsx` → папка `batch-recognition/` (4 файла, все <9KB) ✅
- `consistency-audit-dialog.tsx` → папка `consistency-audit/` (7 файлов, но index.tsx = 11KB) ⚠️

---

## ❌ НЕ ЗАВЕРШЕНО

### 1. Дробление consistency-audit/index.tsx
**Файл:** `components/admin/consistency-audit/index.tsx`  
**Размер:** 11KB (норма <10KB)  
**Действие:** Выделить логику в отдельные файлы (например, хуки или дополнительные компоненты)

### 2. Рефакторинг файлов (осталось 3 файла)

| Файл | Размер | Статус |
|------|--------|--------|
| `service-manager.tsx` | 16KB | Папка создана, файл не разбит |
| `global-unknown-faces-dialog.tsx` | 16KB | Не разбит |
| `duplicate-people-dialog.tsx` | 17KB | Не разбит |

**Действие:** Разбить каждый файл на модули <10KB, создать re-export.

### 3. Dead code cleanup (owner approved list)
Файлы с 0 импортов (кандидаты на удаление):
- `lib/debounce.ts`
- `lib/supabase/client.ts`
- `lib/supabase/safe-call.ts`
- `lib/supabase/with-supabase.ts`
- `python/routers/config.py`

**Действие:** Проверить что не используются и удалить.

### 4. Версия
После завершения работы — bump version в `lib/version.ts`

---

## АРХИТЕКТУРНЫЕ РЕШЕНИЯ (уже задокументированы)

1. **Admin actions на frontend** — оставлены сознательно, редко используются
2. **Social layer** — comments/likes/favorites остаются в Next.js
3. **Unused API routes** — задокументированы в KNOWN_ISSUES.md, решение отложено

---

## ПРОВЕРКА ПОСЛЕ РЕФАКТОРИНГА

```bash
npm run build
```

Если сборка прошла — импорты работают.

---

## ССЫЛКИ

- **KNOWN_ISSUES.md** — текущее состояние тех. долга
- **AI_HANDOFF_RECOMMENDATIONS.md** — результаты аудита
