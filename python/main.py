"""
Padel Tournament Face Recognition API - Main Entry Point

This is the FastAPI application entry point.
Uses core/ for configuration, exceptions, and logging.

v4.1: Migrated to SupabaseService (modular architecture)
- Removed: SupabaseDatabase, SupabaseClient (legacy)
- Added: SupabaseService with modular repositories

v4.2: Added AuthMiddleware for write operation protection
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

# v4.1: Use unified SupabaseService
from services.supabase import SupabaseService, get_supabase_service
from services.face_recognition import FaceRecognitionService
from services.training_service import TrainingService
from services.auth import get_current_user, get_current_user_optional, verify_google_token, create_access_token

# v4.2: Auth middleware
from middleware.auth import AuthMiddleware

# Router imports
from routers import (
    training, recognition, faces, images,
    photographers, people, galleries, locations, organizers, cities,
    admin, user
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
)

# ============================================================
# CORS Configuration
# ============================================================

# Production origins (set via ALLOWED_ORIGINS env var)
# Default: vlcpadel.com + localhost for dev
DEFAULT_ORIGINS = [
    "https://vlcpadel.com",
    "https://www.vlcpadel.com",
    "http://localhost:3000",
]

# Use env var if set, otherwise defaults
cors_origins = settings.cors_origins if settings.cors_origins != ["*"] else DEFAULT_ORIGINS

# Vercel preview deployments pattern
vercel_preview_regex = r"https://[a-zA-Z0-9-]+\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=vercel_preview_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

logger.info(f"CORS configured for origins: {cors_origins} + Vercel previews")

# ============================================================
# Auth Middleware (v4.2)
# Protects all POST/PUT/PATCH/DELETE on /api/* with admin auth
# Must be added AFTER CORS middleware (executes in reverse order)
# ============================================================

app.add_middleware(AuthMiddleware)
logger.info("Auth middleware configured - write operations require admin token")

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

# v4.1: Single SupabaseService instead of separate clients
supabase_service = get_supabase_service()
logger.info("✓ Created SupabaseService (unified)")

# Face recognition service - now uses SupabaseService internally
face_service = FaceRecognitionService(supabase_service=supabase_service)
logger.info("✓ Created FaceRecognitionService")

# Training service - now uses SupabaseService internally
training_service = TrainingService(face_service=face_service, supabase_service=supabase_service)
logger.info("✓ Created TrainingService")

# v4.1: Inject SupabaseService into routers
# Routers receive supabase_service which provides access to all repositories
training.set_training_service(training_service)
faces.set_services(face_service, supabase_service)
recognition.set_services(face_service, supabase_service)
images.set_services(supabase_service, face_service)
photographers.set_services(supabase_service)
people.set_services(supabase_service, face_service)
galleries.set_services(supabase_service, face_service)
locations.set_services(supabase_service)
organizers.set_services(supabase_service)
cities.set_services(supabase_service)
admin.set_services(supabase_service, face_service)
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

def get_supabase() -> SupabaseService:
    """Dependency injection for SupabaseService"""
    return supabase_service

# Legacy aliases for backward compatibility
def get_supabase_db():
    """Legacy: Use get_supabase() instead"""
    return supabase_service

def get_supabase_client():
    """Legacy: Use get_supabase() instead"""
    return supabase_service

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
app.include_router(user.router, prefix="/api", tags=["user"])

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
