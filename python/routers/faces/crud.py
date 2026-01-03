"""
Faces API - CRUD Operations
Get batch faces endpoint

v5.0: Cleaned up - removed unused endpoints (save, update, delete, photo/{id})
"""

from fastapi import APIRouter, Depends

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger
from services.supabase import SupabaseService

from .models import BatchPhotoIdsRequest

logger = get_logger(__name__)
router = APIRouter()


def get_supabase_db():
    from . import supabase_db_instance
    return supabase_db_instance


@router.post("/batch")
async def get_batch_photo_faces(
    request: BatchPhotoIdsRequest,
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """Get all faces for multiple photos in a single request."""
    try:
        logger.info(f"Getting faces for {len(request.photo_ids)} photos")

        if not request.photo_ids:
            return ApiResponse.ok([])

        result = supabase_db.client.table("photo_faces").select("*, people(id, real_name, telegram_name)").in_("photo_id", request.photo_ids).execute()

        logger.info(f"Found {len(result.data or [])} faces")
        return ApiResponse.ok(result.data or [])

    except Exception as e:
        logger.error(f"Error getting batch faces: {e}")
        raise DatabaseError(str(e), operation="get_batch_photo_faces")
