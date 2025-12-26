"""
Faces API Router Package
Face detection, recognition and management endpoints

v5.0: Refactored into modular structure (models, crud, batch_operations, recognition, statistics)
v5.1: Migrated to SupabaseService (removed SupabaseDatabase)
"""

from fastapi import APIRouter

from services.face_recognition import FaceRecognitionService
from services.supabase import SupabaseService

# Global service instances (set via set_services)
face_service_instance = None
supabase_db_instance = None


def set_services(face_service: FaceRecognitionService, supabase_db: SupabaseService):
    """Set service instances for dependency injection."""
    global face_service_instance, supabase_db_instance
    face_service_instance = face_service
    supabase_db_instance = supabase_db


# Create main router
router = APIRouter()

# Import sub-routers AFTER globals are defined (they reference them)
from .crud import router as crud_router
from .batch_operations import router as batch_router
from .recognition import router as recognition_router
from .statistics import router as statistics_router

# Include all sub-routers
router.include_router(crud_router)
router.include_router(batch_router)
router.include_router(recognition_router)
router.include_router(statistics_router)

# Export for main.py
__all__ = ["router", "set_services"]
