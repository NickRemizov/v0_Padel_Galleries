# Database Schema Export Scripts

Эти скрипты позволяют получить полную информацию о структуре базы данных для обновления документации.

## Скрипты

### 1. `export-database-schema.sql`
Основной скрипт для экспорта схемы БД. Получает:
- Список всех таблиц
- Детальную информацию о колонках (типы, nullable, default values, primary keys)
- Foreign key constraints
- Indexes
- Приблизительное количество строк и размеры таблиц

### 2. `export-rls-policies.sql`
Экспортирует Row Level Security (RLS) policies для каждой таблицы.

### 3. `export-functions-and-triggers.sql`
Экспортирует:
- Database functions
- Triggers

## Как использовать

### Вариант 1: Через v0 (рекомендуется)
Просто скажи мне "запусти export-database-schema.sql" и я выполню скрипт и покажу результаты.

### Вариант 2: Через Supabase Dashboard
1. Открой Supabase Dashboard
2. Перейди в SQL Editor
3. Скопируй содержимое скрипта
4. Нажми "Run"
5. Скопируй результаты для документации

### Вариант 3: Через psql (для сервера)
\`\`\`bash
psql $DATABASE_URL -f scripts/export-database-schema.sql > schema-export.txt
\`\`\`

## Результат

После выполнения всех скриптов у тебя будет полная информация для обновления:
- `docs/DATABASE_SCHEMA.md` - описание всех таблиц и полей
- `API_REFERENCE.md` - endpoints на основе структуры БД
- `python/ARCHITECTURE.md` - связи между таблицами

## Следующие шаги

1. Запусти все 3 скрипта
2. Сохрани результаты
3. Скажи мне "обнови DATABASE_SCHEMA.md на основе результатов"
4. Я автоматически обновлю всю документацию
