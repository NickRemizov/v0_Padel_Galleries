"""
Galleries API Router Package
CRUD and advanced operations for galleries
Supports both UUID and slug identifiers for human-readable URLs

v2.0: Modular structure (refactored from monolithic galleries.py)
"""

from fastapi import APIRouter

from services.supabase import SupabaseService
from services.face_recognition import FaceRecognitionService

# Global service instances (set via set_services)
supabase_db_instance: SupabaseService = None
face_service_instance: FaceRecognitionService = None


def set_services(supabase_db: SupabaseService, face_service: FaceRecognitionService = None):
    """Set service instances for dependency injection."""
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service


# Create main router
router = APIRouter()

# Import sub-routers AFTER globals are defined (they reference them)
from .crud import router as crud_router
from .photos import router as photos_router
from .filters import router as filters_router
from .stats import router as stats_router

# Include all sub-routers
router.include_router(crud_router)
router.include_router(photos_router)
router.include_router(filters_router)
router.include_router(stats_router)

# Export for main.py
__all__ = ["router", "set_services"]
