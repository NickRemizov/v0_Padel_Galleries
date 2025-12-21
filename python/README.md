# 🎾 Padel Tournament Face Recognition Server v3.2.8

Сервер для автоматического распознавания и группировки игроков на турнирах по паделу с OAuth аутентификацией и системой обучения моделей.

## 🆕 Что нового в v3.2.8

- ✅ **Метрики распознавания** - blur_score, distance_to_nearest, top_matches в /api/detect-faces
- ✅ **Параметр apply_quality_filters** - возможность отключить фильтры качества
- ✅ **Топ-3 похожих лиц** - показывает имена и similarity для неизвестных лиц
- ✅ **Расстояние до ближайшего** - метрика для оценки уверенности распознавания

## 🚀 Технологии

- **InsightFace (antelopev2)** - распознавание лиц
- **hnswlib** - быстрый поиск похожих лиц
- **HDBSCAN** - автоматическая группировка
- **FastAPI** - REST API
- **Supabase** - база данных и хранилище
- **Google OAuth 2.0** - аутентификация
- **Python 3.11**

## 📦 Быстрая установка

### Автоматическая установка (Рекомендуется)

1. Скачайте архив `galeries.zip`
2. Загрузите на сервер в `/home/nickr/`
3. Выполните команды:

```bash
cd /home/nickr
sudo rm -rf python
unzip -o galeries.zip
chmod +x SETUP.sh
sudo ./SETUP.sh
cd python && ./start.sh
```

**Готово!** Сервер работает на `http://23.88.61.20:8001`

### Что делает SETUP.sh

- Останавливает старый сервер (если запущен)
- Устанавливает Python 3.11 и системные зависимости
- Создает виртуальное окружение
- Устанавливает все Python пакеты
- Создает .env файл с настройками
- Создает необходимые директории

## 🔧 API Endpoints

### Recognition API (v1)

#### Детекция лиц с метриками (НОВОЕ в v3.2.8)
```bash
POST /detect-faces
Content-Type: application/json

{
  "image_url": "https://example.com/photo.jpg",
  "apply_quality_filters": false  // НОВОЕ: отключить фильтры качества
}

Response:
{
  "faces": [
    {
      "insightface_bbox": {"x": 100, "y": 200, "width": 150, "height": 150},
      "confidence": 0.99,
      "blur_score": 245.3,  // НОВОЕ: оценка размытия (выше = четче)
      "embedding": [...],
      "distance_to_nearest": 0.42,  // НОВОЕ: расстояние до ближайшего известного лица
      "top_matches": [  // НОВОЕ: топ-3 похожих лиц
        {"person_id": "uuid", "name": "Иван Иванов", "similarity": 0.58},
        {"person_id": "uuid", "name": "Петр Петров", "similarity": 0.45}
      ]
    }
  ]
}
```

#### Распознавание лица
```bash
POST /recognize-face
Content-Type: application/json

{
  "embedding": [0.1, 0.2, ...],  // 512-мерный вектор
  "confidence_threshold": 0.60
}
```

#### Кластеризация неизвестных лиц
```bash
POST /cluster-unknown-faces?gallery_id=xxx&min_cluster_size=2
```

#### Перестроение индекса
```bash
POST /rebuild-index
```

### Training API (v2)

#### Конфигурация распознавания
```bash
GET /api/v2/config
PUT /api/v2/config
```

#### История обучений
```bash
GET /api/v2/train/history?limit=10&offset=0
```

#### Подготовка датасета
```bash
POST /api/v2/train/prepare
```

#### Запуск обучения
```bash
POST /api/v2/train/execute
```

## 🔗 Интеграция с Vercel (Next.js)

В вашем Next.js проекте на Vercel добавьте переменную окружения:

```
FASTAPI_URL=http://23.88.61.20:8001
NEXT_PUBLIC_FASTAPI_URL=http://23.88.61.20:8001
```

### Пример использования новых метрик:

```typescript
// Детекция лиц без фильтров качества
const response = await fetch(`${API_URL}/detect-faces`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_url: photoUrl,
    apply_quality_filters: false  // Отключить фильтры
  })
});

const { faces } = await response.json();

faces.forEach(face => {
  console.log('Blur score:', face.blur_score);  // Оценка размытия
  console.log('Distance to nearest:', face.distance_to_nearest);  // Расстояние
  console.log('Top matches:', face.top_matches);  // Похожие лица
});
```

## 🐛 Устранение неполадок

### Метрики не возвращаются

Проверьте:
1. Версия бэкенда v3.2.8: `grep "version=" /home/nickr/python/main.py`
2. Логи сервера: `tail -f /home/nickr/python/server.log`
3. Индекс загружен: должны быть сообщения `[v3.0] ✓ HNSW index created`

### Ошибка "players_id_map is empty"

Это означает, что индекс не загружен. Проверьте:
1. Есть ли verified faces в Supabase
2. Есть ли insightface_descriptor в таблице face_descriptors
3. Перезапустите сервер: `cd /home/nickr/python && ./restart.sh`

### Медленная обработка

- Используйте сервер с GPU для ускорения
- Уменьшите размер изображений перед загрузкой
- Увеличьте количество workers в production режиме

## 📊 Производительность

- **CPU (без GPU)**: ~2-3 секунды на фото
- **GPU**: ~0.3-0.5 секунды на фото
- **Группировка**: ~1-2 секунды на 100 лиц
- **Обучение**: зависит от количества лиц (обычно 1-5 минут)

## 📝 Логи

Логи сервера сохраняются в `server.log`:

```bash
cd /home/nickr/python
tail -f server.log
```

## 🆘 Поддержка

При проблемах проверьте:
1. Логи сервера: `tail -f /home/nickr/python/server.log`
2. Доступность порта 8001: `curl http://23.88.61.20:8001/api/health`
3. Наличие свободного места на диске: `df -h`
4. Версию Python: `python3.11 --version`
5. Правильность переменных окружения в `.env`
6. Версию бэкенда: `grep "version=" /home/nickr/python/main.py`

## 📚 Документация API

После запуска сервера откройте:
- Swagger UI: `http://23.88.61.20:8001/docs`
- ReDoc: `http://23.88.61.20:8001/redoc`

## 🆕 Changelog

### v3.2.8 (Текущая версия)
- ✅ Добавлены метрики: blur_score, distance_to_nearest, top_matches
- ✅ Параметр apply_quality_filters для отключения фильтров
- ✅ Топ-3 похожих лиц с именами и similarity
- ✅ Расстояние до ближайшего известного лица

### v3.2.7
- ✅ Исправлена инициализация SupabaseClient
- ✅ Исправлен load_quality_filters()
- ✅ Фильтры качества применяются корректно

### v3.2.1
- ✅ Добавлены Training API endpoints (/api/v2/*)
- ✅ Поддержка фильтрации качества лиц
- ✅ Интеграция с Supabase для обучения
- ✅ Конфигурация распознавания через API
- ✅ История обучений
- ✅ Автоматическая установка через SETUP.sh

### v3.2.0
- Базовая версия с распознаванием лиц
- Google OAuth аутентификация
- Группировка игроков
```

```python file="" isHidden
