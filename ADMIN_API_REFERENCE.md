# Admin API Reference

Диагностические и служебные endpoints для администратора.

**Базовый URL:** `https://padelvalencia.vercel.app/api/admin/`

---

## 1. Debug Gallery

Диагностика и исправление флагов `has_been_processed` в галереях.

### GET `/debug-gallery`

**Без параметров** — список всех галерей с проблемами:

```bash
curl https://padelvalencia.vercel.app/api/admin/debug-gallery
```

**Ответ:**
```json
{
  "total_galleries": 25,
  "problem_galleries": 17,
  "galleries": [
    {
      "id": "uuid",
      "title": "IVIN Padel Tournament",
      "shoot_date": "2025-10-19",
      "total_photos": 127,
      "processed_flag": 0,
      "photos_with_faces": 0,
      "issues": {
        "unprocessed": 127,
        "flag_mismatch": false
      }
    }
  ]
}
```

### GET `/debug-gallery?id={gallery_id}`

Детальная диагностика конкретной галереи:

```bash
curl "https://padelvalencia.vercel.app/api/admin/debug-gallery?id=99242ace-b387-4ba0-98a5-04c577d0ddfd"
```

**Ответ:**
```json
{
  "gallery": { "id": "...", "title": "...", "shoot_date": "..." },
  "stats": {
    "total_photos": 8,
    "processed_by_flag": 6,
    "photos_with_faces": 6,
    "total_faces": 12,
    "faces_with_person": 10,
    "faces_unknown": 2,
    "faces_verified": 8,
    "faces_conf_null": 0
  },
  "issues": {
    "total_problems": 2,
    "has_faces_but_not_processed": 0,
    "no_faces_but_marked_processed": 0,
    "photos_without_any_faces": 2
  },
  "problem_photos": [...],
  "hint": "Add ?fix=true to auto-fix has_been_processed flags"
}
```

### GET `/debug-gallery?id={gallery_id}&fix=true`

**Автоисправление** флагов `has_been_processed`:

```bash
curl "https://padelvalencia.vercel.app/api/admin/debug-gallery?id=99242ace-b387-4ba0-98a5-04c577d0ddfd&fix=true"
```

---

## 2. Check Gallery

Поиск и базовая статистика по галереям.

### GET `/check-gallery?all=true`

Список всех галерей с количеством фото:

```bash
curl "https://padelvalencia.vercel.app/api/admin/check-gallery?all=true"
```

### GET `/check-gallery?search={term}`

Поиск галерей по названию:

```bash
curl "https://padelvalencia.vercel.app/api/admin/check-gallery?search=IVIN"
```

### GET `/check-gallery?id={gallery_id}`

Статистика конкретной галереи:

```bash
curl "https://padelvalencia.vercel.app/api/admin/check-gallery?id=99242ace-..."
```

**Ответ:**
```json
{
  "gallery": { "id": "...", "title": "...", "shoot_date": "..." },
  "stats": {
    "total_photos": 127,
    "processed_photos": 12,
    "total_faces": 45,
    "faces_with_person": 30,
    "faces_conf_1": 25,
    "faces_conf_null": 5,
    "faces_conf_null_with_person": 2
  }
}
```

---

## 3. Face Statistics

Полная статистика по распознаванию лиц.

### GET `/face-statistics`

```bash
curl https://padelvalencia.vercel.app/api/admin/face-statistics
```

### GET `/face-statistics?top=20`

С указанием количества топ-игроков (по умолчанию 15).

**Ответ (структура):**
```json
{
  "confidence_threshold": 0.6,
  
  "players": {
    "total": 150,
    "with_verified": 120,
    "without_verified": 30,
    "without_verified_list": [...]
  },
  
  "faces": {
    "total": 5000,
    "verified": 3500,
    "unverified": 1500
  },
  
  "images": {
    "total": 2500,
    "recognized": 1800,
    "with_1_person": 500,
    "with_2_3_persons": 800,
    "with_4_plus_persons": 500
  },
  
  "player_stats": {
    "avg_photos": 12.5,
    "min_photos": 1,
    "max_photos": 89
  },
  
  "gallery_stats": {
    "avg_photos": 150,
    "min_photos": 8,
    "max_photos": 347
  },
  
  "attention": {
    "few_photos_count": 45,
    "few_photos_list": [...],
    "no_avatar_count": 20,
    "no_avatar_list": [...],
    "unknown_faces": 800
  },
  
  "top_players": [
    { "id": "...", "name": "Player Name", "count": 89 }
  ],
  
  "galleries": {
    "total": 25,
    "fully_verified": 3,
    "fully_verified_list": [...],
    "fully_recognized": 5,
    "fully_recognized_list": [...],
    "fully_processed": 8,
    "fully_processed_list": [...],
    "partially_verified": 7,
    "partially_verified_list": [...],
    "not_processed": 2,
    "not_processed_list": [...]
  },
  
  "integrity": {
    "inconsistent_verified": 0,
    "orphaned_descriptors": 0,
    "avg_unverified_confidence": 0.72
  },
  
  "distribution": [
    { "threshold": 1, "count": 150, "percentage": 100 },
    { "threshold": 5, "count": 120, "percentage": 80 },
    { "threshold": 10, "count": 80, "percentage": 53 }
  ],
  
  "histogram": [
    { "range": "1-2", "count": 30, "total_faces": 45 },
    { "range": "3-4", "count": 25, "total_faces": 87 }
  ]
}
```

---

## 4. Training API

Управление обучением модели распознавания.

### GET `/training/status`
Текущий статус обучения.

### GET `/training/config`  
Текущая конфигурация обучения.

### POST `/training/config`
Обновить конфигурацию.

### POST `/training/prepare`
Подготовить данные для обучения.

### POST `/training/execute`
Запустить обучение.

### GET `/training/history`
История обучений.

---

## Категории галерей

| Категория | Описание |
|-----------|----------|
| **Fully Verified** | Все фото обработаны, все лица верифицированы (confidence=1) |
| **Fully Recognized** | Все фото обработаны, все лица распознаны (confidence<1), нет unknown |
| **Fully Processed** | Все фото обработаны, но есть unknown лица |
| **Partially Verified** | Часть фото не обработана |
| **Not Processed** | Ни одно фото не обработано |

---

## Типичные сценарии использования

### Найти галереи с проблемами
```bash
curl https://padelvalencia.vercel.app/api/admin/debug-gallery
```

### Исправить конкретную галерею
```bash
curl "https://padelvalencia.vercel.app/api/admin/debug-gallery?id=UUID&fix=true"
```

### Получить общую статистику
```bash
curl https://padelvalencia.vercel.app/api/admin/face-statistics
```

### Найти людей без верифицированных фото
```bash
curl https://padelvalencia.vercel.app/api/admin/face-statistics | jq '.players.without_verified_list'
```
