"""
Faces API Router Package
Face detection, recognition and management endpoints

v4.0: Fixed index rebuild on face deletion
v4.1: Added recognize-unknown endpoint
v4.2: Fixed descriptor parsing in recognize-unknown
v4.3: Added pagination to recognize-unknown (Supabase limit is 1000)
v4.4: Added clear-descriptor endpoint for outlier removal
v4.5: Added set-excluded endpoint for excluded_from_index flag
v4.6: Fixed excluded_from_index auto-reset on person_id change
v4.7: Added batch-assign endpoint for cluster assignment with index rebuild
v4.8: Optimized batch-verify - rebuild index only when person_id changes (not just verification)
v5.0: Refactored into modular structure (models, crud, batch_operations, recognition, statistics)
"""

from fastapi import APIRouter

from services.face_recognition import FaceRecognitionService
from services.supabase_database import SupabaseDatabase

# Global service instances (set via set_services)
face_service_instance = None
supabase_db_instance = None


def set_services(face_service: FaceRecognitionService, supabase_db: SupabaseDatabase):
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
