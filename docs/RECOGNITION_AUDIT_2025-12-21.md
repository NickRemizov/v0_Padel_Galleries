# Аудит процесса распознавания лиц

> **Дата:** 21 декабря 2025
> **Версия:** 1.0

---

## 📋 Резюме

| Категория | Критичных | Важных | Незначительных |
|-----------|-----------|--------|----------------|
| Ошибки кода | 1 | 2 | 3 |
| Race conditions | 2 | 0 | 0 |
| Производительность | 0 | 3 | 0 |
| Консистентность | 0 | 2 | 1 |

---

## 🔴 Критические проблемы

### 1. Отсутствующий метод `get_recognition_config_sync()`

**Файл:** `python/services/face_recognition.py:256, 423`

```python
config = self.supabase_db.get_recognition_config_sync()  # НЕ СУЩЕСТВУЕТ!
```

**Проблема:** Метод `get_recognition_config_sync()` вызывается, но в `SupabaseDatabase` есть только `get_recognition_config()` (без суффикса `_sync`).

**Почему работает сейчас:** В основном flow (`process_photo`) `confidence_threshold` всегда передаётся явно, поэтому этот код не выполняется.

**Когда сломается:** Если вызвать `recognize_face()` без параметра `confidence_threshold`.

**Решение:**
```python
# Вариант 1: Добавить алиас в supabase_database.py
def get_recognition_config_sync(self) -> Dict:
    return self.get_recognition_config()

# Вариант 2: Исправить вызов в face_recognition.py
config = self.supabase_db.get_recognition_config()  # убрать _sync
```

---

### 2. Race condition: модификация shared state `quality_filters`

**Файл:** `python/routers/recognition/detect.py:178-183`

```python
if request.apply_quality_filters:
    face_service.quality_filters = {  # ← МОДИФИЦИРУЕТ ОБЩИЙ ОБЪЕКТ!
        "min_detection_score": request.min_detection_score or ...,
        ...
    }
```

**Проблема:** `face_service` — singleton. Если два запроса с разными параметрами качества выполняются одновременно:
1. Запрос A устанавливает `min_blur_score = 50`
2. Запрос B устанавливает `min_blur_score = 100`
3. Запрос A использует `min_blur_score = 100` (неверно!)

**Решение:** Передавать фильтры как параметр, не модифицируя shared state:
```python
filters = {
    "min_detection_score": request.min_detection_score or ...,
    ...
}
detected_faces = await face_service.detect_faces(
    image_url,
    apply_quality_filters=True,
    filters=filters  # передать как параметр
)
```

---

### 3. Race condition: `rebuild_players_index()` без блокировки

**Файл:** `python/services/face_recognition.py:126-149`

**Вызывается из:**
- `routers/faces.py` (4 места)
- `routers/images.py` (2 места)
- `routers/people.py`
- `routers/galleries.py`
- `routers/recognition/maintenance.py`

**Проблема:** Нет блокировки. Если два запроса одновременно вызывают rebuild:
1. Оба загружают embeddings
2. Оба строят индекс
3. Один перезаписывает другого
4. Параллельный `recognize_face()` может получить неконсистентный индекс

**Решение:**
```python
import asyncio

class FaceRecognitionService:
    def __init__(self):
        self._rebuild_lock = asyncio.Lock()

    async def rebuild_players_index(self) -> Dict:
        async with self._rebuild_lock:
            self._load_players_index()
            ...
```

---

## 🟡 Важные проблемы

### 4. Отсутствие пагинации в загрузке неизвестных лиц

**Файлы:**
- `python/services/supabase_client.py:510-513` — `get_unknown_faces_from_gallery()`
- `python/services/supabase_client.py:564-568` — `get_all_unknown_faces()`

**Проблема:** Supabase по умолчанию возвращает максимум 1000 записей. Если неизвестных лиц больше — часть потеряется.

**Сравнение:**
| Метод | Пагинация |
|-------|-----------|
| `get_all_player_embeddings()` | ✅ Есть (page_size=1000) |
| `get_unknown_faces_from_gallery()` | ❌ Нет |
| `get_all_unknown_faces()` | ❌ Нет |

**Решение:** Добавить пагинацию по аналогии с `get_all_player_embeddings()`.

---

### 5. Дублирование классов SupabaseClient и SupabaseDatabase

**Файлы:**
- `python/services/supabase_client.py` (SupabaseClient)
- `python/services/supabase_database.py` (SupabaseDatabase)

**Проблема:** Две разных реализации одних и тех же методов:
- `get_unknown_faces_from_gallery()` — в обоих файлах, с разной логикой!
- `get_recognition_config()` — в обоих, разные сигнатуры

**SupabaseDatabase** (используется в FaceRecognitionService):
```python
# Фильтрует по verified = False
.eq("verified", False)
```

**SupabaseClient** (используется в эндпоинтах):
```python
# НЕ фильтрует по verified
# нет .eq("verified", ...)
```

**Решение:** Унифицировать в один класс или чётко разделить ответственность.

---

### 6. `blur_score` не сохраняется в БД

**Файл:** `python/routers/recognition/detect.py:255-263`

```python
insert_data = {
    "photo_id": request.photo_id,
    "insightface_bbox": bbox,
    "insightface_confidence": det_confidence,
    # blur_score НЕ СОХРАНЯЕТСЯ!
    "recognition_confidence": rec_confidence,
    "verified": False,
    "insightface_descriptor": ...,
}
```

**Проблема:** `blur_score` вычисляется (строка 241), но не записывается в БД. Хотя поле `blur_score` в таблице `photo_faces` существует.

**Решение:**
```python
insert_data = {
    ...
    "blur_score": blur_score,  # добавить
    ...
}
```

---

## 🟢 Незначительные проблемы

### 7. Отсутствие пагинации в других эндпоинтах

**Потенциально проблемные запросы:**
| Файл:строка | Описание |
|-------------|----------|
| `routers/faces.py:86-89` | `/batch` — загрузка лиц по photo_ids |
| `routers/faces.py:401` | statistics — все photo_faces |
| `routers/people.py:103` | все people |
| `routers/admin.py:185` | все people для dropdown |
| `routers/admin.py:231` | все galleries с images |

**Риск:** Низкий сейчас, но вырастет с увеличением данных.

---

### 8. `has_been_processed` не обновляется в `process_photo`

**Файл:** `python/routers/recognition/detect.py`

После сохранения лиц флаг `has_been_processed` в `gallery_images` не обновляется.

Есть отдельный эндпоинт `/check-gallery-consistency` для исправления.

---

### 9. Отсутствие транзакций в batch-операциях

**Пример:** `routers/faces.py:270`
```python
supabase_db.client.table("photo_faces").delete().eq("photo_id", ...).execute()
# ... цикл insert'ов ...
```

Если ошибка между delete и insert — данные потеряются.

---

## 📊 Кластеризация (HDBSCAN)

### Текущее состояние

**Endpoint:** `/api/recognition/cluster-unknown-faces`

**Flow:**
1. Загрузка неизвестных лиц (`person_id = NULL`)
2. Извлечение embeddings
3. HDBSCAN кластеризация
4. Группировка по кластерам

**Параметры HDBSCAN:**
```python
clusterer = hdbscan.HDBSCAN(
    min_cluster_size=min_cluster_size,  # default: 2
    min_samples=1,
    metric='euclidean',
    cluster_selection_epsilon=0.5
)
```

### Возможные причины неработающей кластеризации

1. **Нет неизвестных лиц** — все лица уже имеют `person_id`
2. **Мало лиц** — меньше `min_cluster_size` (по умолчанию 2)
3. **Нет пагинации** — если >1000 неизвестных лиц, загрузятся только первые 1000
4. **Нет embeddings** — лица без `insightface_descriptor` фильтруются

### Как проверить

```bash
# 1. Проверить количество неизвестных лиц
curl -X POST "http://vlcpadel.com:8001/api/recognition/cluster-unknown-faces?min_cluster_size=2"

# 2. Проверить логи
tail -f /tmp/fastapi.log | grep -i cluster
```

---

## 🔧 Рекомендации по исправлению

### Приоритет 1 (критично)
1. ☐ Добавить `get_recognition_config_sync()` или исправить вызов
2. ☐ Убрать модификацию `face_service.quality_filters` — передавать как параметр
3. ☐ Добавить `asyncio.Lock()` для `rebuild_players_index()`

### Приоритет 2 (важно)
4. ☐ Добавить пагинацию в `get_unknown_faces_from_gallery()`
5. ☐ Добавить пагинацию в `get_all_unknown_faces()`
6. ☐ Сохранять `blur_score` в БД
7. ☐ Унифицировать SupabaseClient и SupabaseDatabase

### Приоритет 3 (улучшения)
8. ☐ Добавить пагинацию в остальные запросы
9. ☐ Обновлять `has_been_processed` в `process_photo`
10. ☐ Добавить транзакции в batch-операции

---

## 📁 Файлы для исправления

| Файл | Проблемы |
|------|----------|
| `python/services/face_recognition.py` | #1, #3 |
| `python/routers/recognition/detect.py` | #2, #6, #8 |
| `python/services/supabase_client.py` | #4, #5 |
| `python/services/supabase_database.py` | #1, #5 |
| `python/routers/faces.py` | #7, #9 |

---

## ✅ Что работает правильно

1. **Основной flow распознавания** (`/process-photo`) — корректен
2. **HNSWLIB индекс** — правильно строится и используется
3. **Quality filters** — логика фильтрации корректна
4. **Пагинация embeddings** — есть в `get_all_player_embeddings()`
5. **HDBSCAN кластеризация** — алгоритм правильный
6. **Параметры унифицированы** — `min_blur_score = 80` везде
