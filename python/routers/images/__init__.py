"""
Images API Router Package
Gallery image management endpoints

v2.0: Modular structure (refactored from monolithic images.py)
"""

from fastapi import APIRouter

from services.supabase import SupabaseService
from services.face_recognition import FaceRecognitionService

# Global service instances (set via set_services)
supabase_db_instance: SupabaseService = None
face_service_instance: FaceRecognitionService = None


def set_services(db: SupabaseService, face: FaceRecognitionService):
    """Set service instances for dependency injection."""
    global supabase_db_instance, face_service_instance
    supabase_db_instance = db
    face_service_instance = face


# Create main router
router = APIRouter()

# Import sub-routers AFTER globals are defined
from .gallery import router as gallery_router
from .processing import router as processing_router
from .faces import router as faces_router
from .crud import router as crud_router

# Include all sub-routers
# ORDER MATTERS! Specific routes (/gallery/*, /batch-*) BEFORE parametric (/{id})
router.include_router(gallery_router)     # /gallery/{id}, /gallery/{id}/*
router.include_router(crud_router)        # /batch-add, /{id} delete
router.include_router(processing_router)  # /{id}/mark-processed, /{id}/auto-recognize
router.include_router(faces_router)       # /{id}/people

# Export for main.py
__all__ = ["router", "set_services"]
