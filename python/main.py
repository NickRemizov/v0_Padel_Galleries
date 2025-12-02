from dotenv import load_dotenv
import os

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
from routers import training, recognition, faces

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
    allow_methods=["*"],
    allow_headers=["*"],
)

face_service = FaceRecognitionService()

os.makedirs("uploads", exist_ok=True)
os.makedirs("static", exist_ok=True)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

def get_face_service() -> FaceRecognitionService:
    """Dependency injection для FaceRecognitionService"""
    return face_service

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
app.include_router(recognition.router, prefix="", tags=["recognition"])
app.include_router(faces.router, prefix="/api/faces", tags=["faces"])

if __name__ == "__main__":
    host = os.getenv("SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("SERVER_PORT", "8001"))
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True
    )
