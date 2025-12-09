from dotenv import load_dotenv
import os
import logging  # Added logging import

load_dotenv()

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uvicorn
from services.auth import get_current_user, get_current_user_optional, verify_google_token, create_access_token
import asyncio
import shutil
import re

from services.face_recognition import FaceRecognitionService
from services.training_service import TrainingService
from services.supabase_database import SupabaseDatabase
from services.supabase_client import SupabaseClient
from routers import training, recognition, faces, config, images, photographers, people, galleries, locations, organizers

from models.schemas import (
    RecognitionResponse,
    GroupingResponse,
    PlayerGroup,
    FaceData,
    PhotoWithFaces
)

app = FastAPI(
    title="Padel Tournament Face Recognition API",
    description="API для распознавания и группировки игроков на турнирах по паделу",
    version="3.2.8"
)

allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

vercel_preview_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.vercel\.app")

def is_origin_allowed(origin: str) -> bool:
    if origin in allowed_origins or "*" in allowed_origins:
        return True
    if vercel_preview_pattern.match(origin):
        return True
    return False

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

logging.getLogger("httpx").setLevel(logging.WARNING)  # Disable httpx INFO logs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)  # Reduce uvicorn access logs

print("[Main] ✓ CORS middleware configured with allow_origins=['*']")


print("[Main] Creating singleton service instances...")

# 1. Создаем базовые сервисы (без зависимостей)
supabase_db = SupabaseDatabase()
supabase_client = SupabaseClient()
print("[Main] ✓ Created SupabaseDatabase and SupabaseClient")

# 2. Создаем FaceRecognitionService с передачей supabase_db
face_service = FaceRecognitionService(supabase_db=supabase_db)
print("[Main] ✓ Created FaceRecognitionService")

# 3. Создаем TrainingService с передачей face_service и supabase_client
training_service = TrainingService(face_service=face_service, supabase_client=supabase_client)
print("[Main] ✓ Created TrainingService")

# 4. Устанавливаем глобальные экземпляры в роутерах
training.set_training_service(training_service)
config.set_supabase_client(supabase_client)
faces.set_services(face_service, supabase_db)
recognition.set_services(face_service, supabase_client)
images.set_services(supabase_db, face_service)
photographers.set_services(supabase_db)
people.set_services(supabase_db, face_service)
galleries.set_services(supabase_db)
locations.set_services(supabase_db)
organizers.set_services(supabase_db)
print("[Main] ✓ CRUD routers initialized")
print("[Main] ✓ Service instances injected into all routers")

os.makedirs("uploads", exist_ok=True)
os.makedirs("static", exist_ok=True)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

def get_face_service() -> FaceRecognitionService:
    """Dependency injection для FaceRecognitionService"""
    return face_service

def get_training_service() -> TrainingService:
    """Dependency injection для TrainingService"""
    return training_service

def get_supabase_db() -> SupabaseDatabase:
    """Dependency injection для SupabaseDatabase"""
    return supabase_db

def get_supabase_client() -> SupabaseClient:
    """Dependency injection для SupabaseClient"""
    return supabase_client

@app.get("/", response_class=HTMLResponse)
async def root():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "padel-recognition",
        "model_loaded": face_service.is_ready()
    }

app.include_router(training.router, prefix="/api/v2", tags=["training"])
app.include_router(recognition.router, prefix="/api/recognition", tags=["recognition"])
app.include_router(faces.router, prefix="/api/faces", tags=["faces"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(photographers.router, prefix="/api/photographers", tags=["photographers"])
app.include_router(people.router, prefix="/api/people", tags=["people"])
app.include_router(galleries.router, prefix="/api/galleries", tags=["galleries"])
app.include_router(locations.router, prefix="/api/locations", tags=["locations"])
app.include_router(organizers.router, prefix="/api/organizers", tags=["organizers"])

if __name__ == "__main__":
    host = os.getenv("SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("SERVER_PORT", "8001"))
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True
    )
