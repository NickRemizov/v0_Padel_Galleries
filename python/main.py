"""
Padel Tournament Face Recognition API - Main Entry Point

This is the FastAPI application entry point.
Uses core/ for configuration, exceptions, and logging.
"""

from dotenv import load_dotenv
load_dotenv()

import os
import re
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Core imports - new architecture foundation
from core.config import settings, VERSION
from core.exceptions import AppException
from core.responses import ApiResponse
from core.logging import setup_logging, get_logger

# Setup logging first
setup_logging(level="INFO" if not settings.debug else "DEBUG")
logger = get_logger(__name__)

# Service imports
from services.face_recognition import FaceRecognitionService
from services.training_service import TrainingService
from services.supabase_database import SupabaseDatabase
from services.supabase_client import SupabaseClient
from services.auth import get_current_user, get_current_user_optional, verify_google_token, create_access_token

# Router imports
from routers import (
    training, recognition, faces, images,
    photographers, people, galleries, locations, organizers, cities,
    admin
)

# ============================================================
# Application Setup
# ============================================================

app = FastAPI(
    title="Padel Tournament Face Recognition API",
    description="API для распознавания и группировки игроков на турнирах по паделу",
    version=VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    redirect_slashes=False,  # Don't redirect /api/people to /api/people/
)

# ============================================================
# CORS Configuration
# ============================================================

vercel_preview_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.vercel\.app")

def is_origin_allowed(origin: str) -> bool:
    if origin in settings.cors_origins or "*" in settings.cors_origins:
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

logger.info("CORS middleware configured")

# ============================================================
# Global Exception Handlers
# ============================================================

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """
    Handle all custom AppException and subclasses.
    Returns unified ApiResponse format.
    """
    logger.warning(f"AppException: {exc.code} - {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content=ApiResponse.from_exception(exc).model_dump()
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Handle unexpected exceptions.
    Logs full traceback and returns generic error.
    """
    logger.error(f"Unhandled exception: {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ApiResponse.fail(
            message="Internal server error",
            code="INTERNAL_ERROR"
        ).model_dump()
    )

# ============================================================
# Service Initialization (Dependency Injection)
# ============================================================

logger.info(f"Starting Padel Recognition API v{VERSION}")
logger.info("Creating singleton service instances...")

# 1. Database clients
supabase_db = SupabaseDatabase()
supabase_client = SupabaseClient()
logger.info("✓ Created SupabaseDatabase and SupabaseClient")

# 2. Face recognition service
face_service = FaceRecognitionService(supabase_db=supabase_db)
logger.info("✓ Created FaceRecognitionService")

# 3. Training service
training_service = TrainingService(face_service=face_service, supabase_client=supabase_client)
logger.info("✓ Created TrainingService")

# 4. Inject services into routers
training.set_training_service(training_service)
faces.set_services(face_service, supabase_db)
recognition.set_services(face_service, supabase_client)
images.set_services(supabase_db, face_service)
photographers.set_services(supabase_db)
people.set_services(supabase_db, face_service)
galleries.set_services(supabase_db, face_service)
locations.set_services(supabase_db)
organizers.set_services(supabase_db)
cities.set_services(supabase_db)
admin.set_services(supabase_db)
logger.info("✓ Service instances injected into all routers")

# ============================================================
# Static Files & Directories
# ============================================================

os.makedirs(settings.uploads_dir, exist_ok=True)
os.makedirs("static", exist_ok=True)

app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

# ============================================================
# Dependency Injection Functions
# ============================================================

def get_face_service() -> FaceRecognitionService:
    """Dependency injection for FaceRecognitionService"""
    return face_service

def get_training_service() -> TrainingService:
    """Dependency injection for TrainingService"""
    return training_service

def get_supabase_db() -> SupabaseDatabase:
    """Dependency injection for SupabaseDatabase"""
    return supabase_db

def get_supabase_client() -> SupabaseClient:
    """Dependency injection for SupabaseClient"""
    return supabase_client

# ============================================================
# Root Endpoints
# ============================================================

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve index.html for root path"""
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return HTMLResponse(
            content=f"<h1>Padel Face Recognition API v{VERSION}</h1><p>API is running. Visit <a href='/api/docs'>/api/docs</a> for documentation.</p>",
            status_code=200
        )

@app.get("/api/health")
async def health_check():
    """
    Health check endpoint.
    Returns service status and model readiness.
    """
    return ApiResponse.ok({
        "status": "healthy",
        "service": "padel-recognition",
        "version": VERSION,
        "model_loaded": face_service.is_ready()
    }).model_dump()

# ============================================================
# Router Registration
# ============================================================

app.include_router(training.router, prefix="/api/v2", tags=["training"])
app.include_router(recognition.router, prefix="/api/recognition", tags=["recognition"])
app.include_router(faces.router, prefix="/api/faces", tags=["faces"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(photographers.router, prefix="/api/photographers", tags=["photographers"])
app.include_router(people.router, prefix="/api/people", tags=["people"])
app.include_router(galleries.router, prefix="/api/galleries", tags=["galleries"])
app.include_router(locations.router, prefix="/api/locations", tags=["locations"])
app.include_router(organizers.router, prefix="/api/organizers", tags=["organizers"])
app.include_router(cities.router, prefix="/api/cities", tags=["cities"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])

logger.info(f"Application startup complete. Running on {settings.server_host}:{settings.server_port}")

# ============================================================
# Entry Point
# ============================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=settings.debug
    )
