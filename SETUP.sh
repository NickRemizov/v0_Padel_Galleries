#!/bin/bash

set -e

echo "=========================================="
echo "  Установка FastAPI сервера Galeries"
echo "=========================================="
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "❌ ОШИБКА: Запустите скрипт с sudo"
    echo "   sudo ./SETUP.sh"
    exit 1
fi

echo "[1/7] Остановка старого сервера (если запущен)..."
if [ -f "python/server.pid" ]; then
    OLD_PID=$(cat python/server.pid 2>/dev/null)
    if [ -n "$OLD_PID" ] && ps -p $OLD_PID > /dev/null 2>&1; then
        kill $OLD_PID 2>/dev/null || true
        echo "  ✓ Старый сервер остановлен (PID: $OLD_PID)"
    fi
fi

echo "[2/7] Установка системных зависимостей и Python 3.11..."
apt-get update -qq
apt-get install -y software-properties-common > /dev/null 2>&1
add-apt-repository ppa:deadsnakes/ppa -y > /dev/null 2>&1
apt-get update -qq
apt-get install -y python3.11 python3.11-venv python3.11-dev build-essential > /dev/null 2>&1

echo "[3/7] Переход в директорию python..."
cd python || { echo "❌ Папка python не найдена!"; exit 1; }

echo "[4/7] Создание .env файла..."
cat > .env << 'EOF'
SERVER_HOST=0.0.0.0
SERVER_PORT=8001
SERVER_IP=23.88.61.20

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

JWT_SECRET_KEY=

ALLOWED_ORIGINS=https://padelvalencia.vercel.app,http://localhost:3000

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

POSTGRES_URL=

BLOB_READ_WRITE_TOKEN=
EOF

if [ -d "venv" ]; then
    echo "  Удаление старого виртуального окружения..."
    rm -rf venv
fi

echo "[5/7] Создание виртуального окружения..."
python3.11 -m venv venv || { echo "❌ Не удалось создать venv!"; exit 1; }

echo "[6/7] Обновление pip..."
source venv/bin/activate
python -m pip install --upgrade pip setuptools wheel --quiet

echo "[7/7] Установка зависимостей (это займет 2-3 минуты)..."
pip install fastapi==0.109.0 uvicorn[standard]==0.27.0 python-multipart==0.0.6 insightface==0.7.3 onnxruntime>=1.17.0 numpy==1.24.3 opencv-python-headless==4.9.0.80 pillow==10.2.0 hnswlib==0.8.0 hdbscan==0.8.33 scikit-learn==1.4.0 aiofiles==23.2.1 pydantic==2.5.3 python-jose[cryptography]==3.3.0 python-dotenv==1.0.0 httpx==0.26.0 supabase>=2.0.0 --quiet

echo "  Создание необходимых директорий..."
mkdir -p data
mkdir -p models

chmod +x *.sh

echo ""
echo "=========================================="
echo "  ✓ Установка завершена успешно!"
echo "=========================================="
echo ""
echo "Для запуска сервера выполните:"
echo "  cd python && ./start.sh"
echo ""
echo "Сервер будет доступен на http://23.88.61.20:8001"
echo ""
