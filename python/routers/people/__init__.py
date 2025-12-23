"""
People API Router Package
CRUD and advanced operations for people (players)
Supports both UUID and slug identifiers for human-readable URLs

v5.0: Refactored into modular structure (models, crud, photos, avatar, consistency, outliers)
"""

from fastapi import APIRouter
from typing import Optional, List

from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService
from core.slug import resolve_identifier

# Global service instances (set via set_services)
supabase_db_instance: SupabaseDatabase = None
face_service_instance: FaceRecognitionService = None


def set_services(supabase_db: SupabaseDatabase, face_service: FaceRecognitionService):
    """Set service instances for dependency injection."""
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service


# Helper functions used by sub-modules
def _resolve_person(identifier: str) -> Optional[dict]:
    """Resolve person by ID or slug."""
    return resolve_identifier(
        supabase_db_instance.client,
        "people",
        identifier,
        slug_column="slug"
    )


def _get_person_id(identifier: str) -> str:
    """Get person ID from identifier (ID or slug). Raises NotFoundError if not found."""
    from core.exceptions import NotFoundError
    person = _resolve_person(identifier)
    if not person:
        raise NotFoundError("Person", identifier)
    return person["id"]


def _convert_bbox_to_array(bbox) -> Optional[List[float]]:
    """
    Convert bbox from various formats to [x1, y1, x2, y2] array.
    
    Supports:
    - Already array [x1, y1, x2, y2] -> return as is
    - Object {x, y, width, height} -> convert to [x, y, x+width, y+height]
    - None -> return None
    """
    if bbox is None:
        return None
    
    # Already an array
    if isinstance(bbox, list):
        if len(bbox) == 4:
            return [float(x) for x in bbox]
        return None
    
    # Object with x, y, width, height
    if isinstance(bbox, dict):
        try:
            x = float(bbox.get("x", 0))
            y = float(bbox.get("y", 0))
            width = float(bbox.get("width", 0))
            height = float(bbox.get("height", 0))
            return [x, y, x + width, y + height]
        except (TypeError, ValueError):
            return None
    
    return None


# Create main router
router = APIRouter()

# Import sub-routers AFTER globals are defined (they reference them)
from .crud import router as crud_router
from .photos import router as photos_router
from .avatar import router as avatar_router
from .consistency import router as consistency_router
from .outliers import router as outliers_router

# IMPORTANT: Include STATIC routes BEFORE dynamic routes with {id}
# Otherwise FastAPI will try to match "consistency-audit" as {id} UUID
router.include_router(consistency_router)  # /consistency-audit, /{id}/embedding-consistency
router.include_router(outliers_router)     # /audit-all-embeddings, /{id}/clear-outliers
router.include_router(crud_router)         # /, /{id} - MUST BE LAST (has catch-all {id})
router.include_router(photos_router)       # /{id}/photos, /{id}/photos-with-details
router.include_router(avatar_router)       # /{id}/avatar

# Export for main.py
__all__ = ["router", "set_services"]
