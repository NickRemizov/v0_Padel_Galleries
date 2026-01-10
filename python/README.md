# 🎾 Padel Tournament Face Recognition Server v6.1

Сервер для автоматического распознавания и группировки игроков на турнирах по паделу с OAuth аутентификацией и системой обучения моделей.

## 🆕 Что нового в v6.x

### v6.1.0 — Audit Fixes
- ✅ **Singleton fix** — user router использует инжектированный face_service
- ✅ **auto-recognize sync** — индекс синхронизируется при автоматическом распознавании
- ✅ **Empty index handling** — graceful старт с пустой БД

### v6.0.0 — Variant C Architecture
- ✅ **ВСЕ лица в индексе** — включая без person_id и excluded
- ✅ **update_metadata()** — изменение person_id БЕЗ rebuild индекса
- ✅ **excluded_map** — исключённые лица в индексе, но пропускаются при распознавании

## 🚀 Технологии

- **InsightFace (antelopev2)** — распознавание лиц
- **hnswlib** — быстрый поиск похожих лиц
- **HDBSCAN** — автоматическая группировка
- **FastAPI** — REST API
- **Supabase** — база данных и хранилище
- **Google OAuth 2.0** — аутентификация
- **Python 3.11**

## 🔐 Security

### AuthMiddleware

Все write-операции защищены централизованно:

| Метод | Путь | Требует токен |
|-------|------|---------------|
| GET/HEAD | /api/* | ❌ Нет |
| POST/PUT/PATCH/DELETE | /api/* | ✅ Да (admin) |
| OPTIONS | * | ❌ Нет (CORS) |

**Публичные пути (без токена):** `/`, `/api/health`, `/api/docs`, `/api/redoc`

**Проверка:**
\`\`\`bash
# POST без токена → 401 Not authenticated
curl -X POST http://vlcpadel.com:8001/api/people \
  -H "Content-Type: application/json" \
  -d '{"real_name": "Test"}'

# GET без токена → 200 OK
curl http://vlcpadel.com:8001/api/people/
\`\`\`

## 🔧 API Endpoints

### People API (Оптимизировано в v5.1)

\`\`\`bash
# Базовый список людей
GET /api/people/

# С статистикой верификации
GET /api/people/?with_stats=true

# Оптимизировано для галереи игроков (НОВОЕ)
GET /api/people/?for_gallery=true
# Возвращает: photo_count, most_recent_gallery_date
# Производительность: 1 запрос вместо 101
\`\`\`

### Recognition API

\`\`\`bash
# Детекция лиц
POST /detect-faces
Content-Type: application/json
{
  "image_url": "https://example.com/photo.jpg",
  "apply_quality_filters": false
}

# Распознавание
POST /recognize-face
{
  "embedding": [0.1, 0.2, ...],
  "confidence_threshold": 0.60
}

# Кластеризация неизвестных
POST /cluster-unknown-faces?gallery_id=xxx

# Перестроение индекса
POST /rebuild-index
\`\`\`

### Training API

\`\`\`bash
# Конфигурация
GET /api/v2/config
PUT /api/v2/config

# История обучений
GET /api/v2/train/history?limit=10

# Подготовка датасета
POST /api/v2/train/prepare

# Запуск обучения
POST /api/v2/train/execute
\`\`\`

## 🔗 Интеграция с Vercel (Next.js)

### Environment Variables

\`\`\`env
FASTAPI_URL=http://vlcpadel.com:8001
NEXT_PUBLIC_FASTAPI_URL=http://vlcpadel.com:8001
\`\`\`

### On-Demand Revalidation

После изменений в админке ISR кеш сбрасывается автоматически:

\`\`\`typescript
// app/api/revalidate/route.ts
POST /api/revalidate
Body: { paths: ["/players", "/gallery"] }
\`\`\`

### Auth Headers (для защищённых операций)

\`\`\`typescript
async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { "Authorization": `Bearer ${session.access_token}` }
  }
  return {}
}

// Использование
const result = await apiFetch("/api/people", {
  method: "POST",
  body: JSON.stringify(data),
  headers: await getAuthHeaders(),
})
\`\`\`

## 📦 Установка

\`\`\`bash
cd /home/nickr
sudo rm -rf python
unzip -o galeries.zip
chmod +x SETUP.sh
sudo ./SETUP.sh
cd python && ./start.sh
\`\`\`

## 📊 Производительность

| Операция | До v5.1 | После v5.1 |
|----------|---------|------------|
| Players gallery load | 5-10 сек (101 запрос) | ~50ms (1 запрос) |
| API response format | Разный | Унифицированный ApiResponse |
| Security check | Per-endpoint | Centralized middleware |

## 📝 Логи

\`\`\`bash
cd /home/nickr/python
tail -f server.log
\`\`\`

## 📚 Документация

- **Swagger UI:** http://vlcpadel.com:8001/docs
- **ReDoc:** http://vlcpadel.com:8001/redoc
- **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)

## 🆕 Changelog

### v6.1.0 (Текущая)
- ✅ Singleton fix в user router
- ✅ auto-recognize теперь синхронизирует индекс
- ✅ Empty index graceful handling
- ✅ k=0 protection в query()

### v6.0.0 — Variant C
- ✅ ВСЕ лица с дескрипторами в индексе
- ✅ update_metadata() для изменения person_id без rebuild
- ✅ excluded_map для исключённых лиц
- ✅ hidden_by_user НЕ влияет на индекс

### v5.1.0
- ✅ AuthMiddleware — централизованная защита write-операций
- ✅ Оптимизация GET /api/people?for_gallery=true
- ✅ On-Demand Revalidation для Next.js ISR
- ✅ Frontend токены во всех action файлах

### v5.0.0
- ✅ All routers migrated to ApiResponse + custom exceptions

### v4.1.0
- ✅ People router модуляризация (crud, photos, avatar, outliers, consistency)
- ✅ Admin router added

### v4.0.0
- ✅ Clean Architecture implementation
- ✅ Custom exceptions hierarchy
- ✅ Centralized logging
