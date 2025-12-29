# Frontend TODO - Задачи по рефакторингу Next.js фронтенда

> Файл создан: 14.12.2025
> Последнее обновление: 29.12.2025

---

## ✅ Рефакторинг крупных компонентов ЗАВЕРШЁН

Все крупные файлы (>500 строк) разбиты на модули.

### Результаты

| Файл | Было | Модулей | Статус |
|------|------|---------|--------|
| `gallery-images-manager.tsx` | 1086 стр | 12 | ✅ |
| `face-tagging-dialog.tsx` | ~900 стр | 11 | ✅ |
| `integrity.ts` | 926 стр | 7 | ✅ |
| `person-gallery-dialog.tsx` | 830 стр | 12 | ✅ |
| `database-integrity-checker.tsx` | 785 стр | 10 | ✅ |
| `face-training-manager.tsx` | 750 стр | 9 | ✅ |
| `people.ts` | 670 стр | 6 | ✅ |
| `image-lightbox.tsx` | 600 стр | 8 | ✅ |
| `faces.ts` | 520 стр | 5 | ✅ |
| `auto-recognition-dialog.tsx` | ~500 стр | 8 | ✅ |
| `unknown-faces-review-dialog.tsx` | ~500 стр | 8 | ✅ |

**Итого:** ~8000 строк → 96 модулей

---

## Структура отрефакторенных модулей

\`\`\`
app/admin/actions/
├── integrity/                # 7 модулей
│   ├── index.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── utils.ts
│   ├── check-integrity.ts
│   ├── fix-integrity.ts
│   └── face-actions.ts
│
├── people/                   # 6 модулей
│   ├── index.ts
│   ├── types.ts
│   ├── photo-actions.ts
│   ├── embedding-consistency.ts
│   ├── consistency-audit.ts
│   └── duplicate-people.ts
│
├── faces/                    # 5 модулей
│   ├── index.ts
│   ├── photo-processing.ts
│   ├── face-crud.ts
│   ├── face-batch.ts
│   ├── gallery-images.ts
│   └── recognition.ts
│
├── integrity.ts              # Реэкспорт
├── people.ts                 # Реэкспорт
└── faces.ts                  # Реэкспорт

components/
├── image-lightbox/           # 8 модулей
│   ├── ImageLightbox.tsx
│   ├── types.ts
│   ├── index.ts
│   ├── hooks/
│   ├── utils/
│   └── components/
│
├── image-lightbox.tsx        # Реэкспорт
│
└── admin/
    ├── database-integrity/   # 10 модулей
    ├── face-training/        # 9 модулей
    ├── gallery-images/       # 12 модулей
    ├── person-gallery/       # 12 модулей
    ├── face-tagging/         # 11 модулей
    ├── auto-recognition/     # 8 модулей
    └── unknown-faces-review/ # 8 модулей
\`\`\`

---

## 🔄 Остающиеся задачи

### Прямой Supabase: миграция на API

> Детали в `python/docs/BACKEND_TODO.md` — задача #8

**Краткое резюме:**
- ~15 файлов используют `createClient()` напрямую
- Нужно перенести все операции через FastAPI
- Статус: ❌ TODO

### Средние файлы (10-20KB) - низкий приоритет

| Файл | Размер | Статус |
|------|--------|--------|
| `auto-recognition-dialog.tsx` | 16KB | ✅ Выполнено |
| `add-gallery-dialog.tsx` | 14KB | ⏸ Отложено |
| `edit-gallery-dialog.tsx` | 14KB | ⏸ Отложено |
| `cleanup-duplicates-button.tsx` | 14KB | ⏸ Отложено |
| `regenerate-descriptors-dialog.tsx` | 12KB | ⏸ Отложено |
| `person-list.tsx` | 11KB | ⏸ Отложено |
| `avatar-selector.tsx` | 10KB | ⏸ Отложено |
| `gallery-card.tsx` | 10KB | ⏸ Отложено |
| `cities-manager.tsx` | 10KB | ⏸ Отложено |

---

## Паттерны рефакторинга

### Выделение хуков

\`\`\`typescript
// БЫЛО: всё в компоненте
const [data, setData] = useState([])
const [loading, setLoading] = useState(false)
const fetchData = async () => { ... }
useEffect(() => { fetchData() }, [])

// СТАЛО: отдельный хук
// hooks/useGalleryImages.ts
export function useGalleryImages(galleryId: string) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  // ...
  return { data, loading, refetch }
}
\`\`\`

### Композиция вместо монолита

\`\`\`typescript
// БЫЛО: один огромный компонент
function GalleryImagesManager() {
  return (
    <div>
      {/* 200 строк разметки */}
    </div>
  )
}

// СТАЛО: композиция
function GalleryImagesManager() {
  return (
    <div>
      <ImageGrid images={images} onSelect={handleSelect} />
      <BulkActions selected={selected} onDelete={handleDelete} />
      <UploadProgress uploads={uploads} />
    </div>
  )
}
\`\`\`

---

## Ссылки

- [REFACTORING_SPEC.md](./REFACTORING_SPEC.md) — детальное ТЗ
- [FRONTEND_REFACTORING_BRIEF.md](./FRONTEND_REFACTORING_BRIEF.md) — методология
- [TODO.md](./TODO.md) — общий статус
