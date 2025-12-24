"""
People API Router Package
CRUD and advanced operations for people (players)
Supports both UUID and slug identifiers for human-readable URLs

v1.0: Initial modular structure (refactored from monolithic people.py)
"""

from fastapi import APIRouter

from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService

# Global service instances (set via set_services)
supabase_db_instance: SupabaseDatabase = None
face_service_instance: FaceRecognitionService = None


def set_services(supabase_db: SupabaseDatabase, face_service: FaceRecognitionService):
    """Set service instances for dependency injection."""
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service


# Create main router
router = APIRouter()

# Import sub-routers AFTER globals are defined (they reference them)
from .crud import router as crud_router
from .photos import router as photos_router
from .avatar import router as avatar_router
from .consistency import router as consistency_router
from .outliers import router as outliers_router

# Include all sub-routers
router.include_router(crud_router)
router.include_router(photos_router)
router.include_router(avatar_router)
router.include_router(consistency_router)
router.include_router(outliers_router)

# Export for main.py
__all__ = ["router", "set_services"]
