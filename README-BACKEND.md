# Galeries FastAPI Backend v3.2.8

FastAPI сервер для распознавания лиц с использованием InsightFace и HNSWLIB.

## Быстрая установка

```bash
cd /home/nick
sudo rm -rf python
unzip -o galeries.zip
chmod +x SETUP.sh
sudo ./SETUP.sh
cd python && ./start.sh
```

## Что внутри

- **InsightFace** - детекция лиц и эмбеддинги (512 измерений)
- **HNSWLIB** - быстрый поиск по эмбеддингам
- **HDBSCAN** - кластеризация неизвестных лиц
- **Supabase PostgreSQL + pgvector** - хранение дескрипторов
- **Quality Filters** - фильтрация по det_score, размеру, blur_score

## API Endpoints

### Recognition API
- `POST /api/detect-faces` - Детекция лиц на изображении
- `POST /api/recognize-face` - Распознавание лица по эмбеддингу
- `POST /api/cluster-unknown-faces` - Кластеризация неизвестных лиц
- `POST /api/rebuild-index` - Перестроение HNSWLIB индекса

### Training API (v2)
- `GET /api/v2/config` - Получить конфигурацию
- `PUT /api/v2/config` - Обновить конфигурацию
- `POST /api/v2/train/execute` - Запуск обучения
- `GET /api/v2/train/status/{sessionId}` - Статус обучения

## Переменные окружения

Создаются автоматически при запуске `SETUP.sh`:

```env
SERVER_HOST=0.0.0.0
SERVER_PORT=8001
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Структура

```
python/
├── main.py                          # FastAPI app
├── requirements.txt                 # Dependencies
├── start.sh                         # Startup script
├── routers/
│   ├── recognition.py              # Recognition endpoints
│   └── training.py                 # Training endpoints
├── services/
│   ├── face_recognition.py         # InsightFace service
│   ├── training_service.py         # Training logic
│   ├── supabase_client.py          # Supabase client
│   ├── supabase_database.py        # DB operations
│   └── auth.py                     # Authentication
└── models/
    └── schemas.py                  # Pydantic models
```

## Версия

**Backend v3.2.8** - Production Ready
