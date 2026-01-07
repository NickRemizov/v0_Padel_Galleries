"""
Admin Router Package - Administrative endpoints for face recognition system

Migrated from frontend direct Supabase access to centralized FastAPI.

v1.0: Initial modular structure (refactored from monolithic admin.py)
v1.1: Added face_service_instance for debug endpoints
v1.2: Migrated to SupabaseService (removed SupabaseDatabase)
v1.3: Modularized debug.py into debug/ package
"""

from fastapi import APIRouter

from services.supabase import SupabaseService
from services.face_recognition import FaceRecognitionService
from core.logging import get_logger

logger = get_logger(__name__)

# Global service instances (set via set_services)
supabase_db_instance: SupabaseService = None
face_service_instance: FaceRecognitionService = None


def set_services(supabase_db: SupabaseService, face_service: FaceRecognitionService = None):
    """Set service instances for dependency injection."""
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service
    logger.info("Admin router services initialized")


# Create main router
router = APIRouter()

# Import sub-routers AFTER globals are defined
from .statistics import router as statistics_router
from .debug import router as debug_router  # Now imports from debug/ package
from .check import router as check_router
from .auth import router as auth_router
from .admins import router as admins_router
from .activity import router as activity_router
from .content import router as content_router

# Include all sub-routers
router.include_router(statistics_router)
router.include_router(debug_router)
router.include_router(check_router)
router.include_router(auth_router)
router.include_router(admins_router)
router.include_router(activity_router)
router.include_router(content_router)

# Export for main.py
__all__ = ["router", "set_services"]
