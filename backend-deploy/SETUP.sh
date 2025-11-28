#!/bin/bash

set -e

echo "=========================================="
echo "  Установка FastAPI сервера Galeries"
echo "  Backend v3.2.1"
echo "=========================================="
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "❌ ОШИБКА: Запустите скрипт с sudo"
    echo "   sudo ./SETUP.sh"
    exit 1
fi

echo "[1/7] Остановка старого сервера (если запущен)..."
pkill -f "python main.py" 2>/dev/null || true
sleep 2
echo "  ✓ Старый сервер остановлен"

echo "[2/7] Установка системных зависимостей и Python 3.11..."
apt-get update -qq
apt-get install -y software-properties-common > /dev/null 2>&1
add-apt-repository ppa:deadsnakes/ppa -y > /dev/null 2>&1
apt-get update -qq
apt-get install -y python3.11 python3.11-venv python3.11-dev build-essential > /dev/null 2>&1
echo "  ✓ Python 3.11 установлен"

echo "[3/7] Переход в директорию python..."
cd python || { echo "❌ Папка python не найдена!"; exit 1; }

echo "[4/7] Создание .env файла..."
cat > .env << 'EOF'
SERVER_HOST=0.0.0.0
SERVER_PORT=8001
SERVER_IP=23.88.61.20

GOOGLE_CLIENT_ID=465868289099-ffmm1rgv0e3bitl7mkdsm3k6psu6v5bl.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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

JWT_SECRET_KEY=R=U8"3{$wWtUF]=*[m%s1!ZW!Sl(4_TeRy6J8OU]9=$Gm=7+,Yw@!0-JEMP|?SG

ALLOWED_ORIGINS=https://padelvalencia.vercel.app,http://localhost:3000

SUPABASE_URL=https://jczmumbzpqlckbkgznsd.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjem11bWJ6cHFsY2tia2d6bnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDc1MDQsImV4cCI6MjA3NjA4MzUwNH0.qCrrVHh00ozgvAifwOFhC1qbnGdtWEL0II057FNRIdc
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjem11bWJ6cHFsY2tia2d6bnNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwNzUwNCwiZXhwIjoyMDc2MDgzNTA0fQ.PGmwvS_r0ACiVmoxz9qN4nCicZ49WKEQ2vwDAtGnVuo

POSTGRES_URL=postgres://postgres.jczmumbzpqlckbkgznsd:FmMMVkRCq0PgXWrR@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x

BLOB_READ_WRITE_TOKEN=vercel_blob_rw_y0Gaup6DW5CBDoGA_vnBhUh2KJkDpvmB5MjgdISFYZ0c3on
EOF
echo "  ✓ Файл .env создан"

if [ -d "venv" ]; then
    echo "  Удаление старого виртуального окружения..."
    rm -rf venv
fi

echo "[5/7] Создание виртуального окружения..."
python3.11 -m venv venv || { echo "❌ Не удалось создать venv!"; exit 1; }
echo "  ✓ Виртуальное окружение создано"

echo "[6/7] Обновление pip..."
source venv/bin/activate
python -m pip install --upgrade pip setuptools wheel --quiet
echo "  ✓ pip обновлен"

echo "[7/7] Установка зависимостей (это займет 2-3 минуты)..."
pip install -r requirements.txt --quiet
echo "  ✓ Зависимости установлены"

echo "  Создание необходимых директорий..."
mkdir -p data/cache/photos
mkdir -p models
mkdir -p uploads
echo "  ✓ Директории созданы"

chmod +x *.sh
echo "  ✓ Права на выполнение установлены"

echo ""
echo "=========================================="
echo "  ✓ Установка завершена успешно!"
echo "  Backend v3.2.1 готов к запуску"
echo "=========================================="
echo ""
echo "Для запуска сервера выполните:"
echo "  cd python && ./start.sh"
echo ""
echo "Сервер будет доступен на:"
echo "  http://23.88.61.20:8001"
echo "  http://23.88.61.20:8001/docs (API документация)"
echo ""
