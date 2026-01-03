"""
Galleries Stats Endpoints

Endpoints:
- GET /{id}/stats - Get face recognition stats for a gallery
"""

from fastapi import APIRouter

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger

from .helpers import get_supabase_db, _get_gallery_id

logger = get_logger(__name__)
router = APIRouter()


@router.get("/{identifier}/stats")
async def get_gallery_stats(identifier: str):
    """Get face recognition stats for a gallery.

    v1.5: NFD photos (no faces detected) count as verified.
    Photo is verified if:
    - No faces in photo_faces table (NFD - no faces detected), OR
    - has_been_processed=true AND all faces have verified=true
    """
    supabase_db = get_supabase_db()
    
    try:
        gallery_id = _get_gallery_id(identifier)
        
        # Fetch images with has_been_processed status
        images_result = supabase_db.client.table("gallery_images").select(
            "id, has_been_processed"
        ).eq("gallery_id", gallery_id).execute()
        images = images_result.data or []
        
        if not images:
            return ApiResponse.ok({
                "isFullyVerified": True,
                "verifiedCount": 0,
                "totalCount": 0
            })
        
        image_ids = [img["id"] for img in images]
        processed_status = {img["id"]: img.get("has_been_processed", False) for img in images}
        
        faces_result = supabase_db.client.table("photo_faces").select(
            "photo_id, verified"
        ).in_("photo_id", image_ids).execute()
        
        all_faces = faces_result.data or []
        
        faces_by_photo = {}
        for face in all_faces:
            pid = face["photo_id"]
            if pid not in faces_by_photo:
                faces_by_photo[pid] = []
            faces_by_photo[pid].append(face)
        
        verified_count = 0
        for photo_id in image_ids:
            is_processed = processed_status.get(photo_id, False)

            # Unprocessed photos are never verified
            if not is_processed:
                continue

            faces = faces_by_photo.get(photo_id, [])

            if len(faces) == 0:
                # Processed + no faces = NFD (verified)
                verified_count += 1
            elif all(f.get("verified", False) for f in faces):
                # Processed + all faces verified = verified
                verified_count += 1
        
        total_count = len(image_ids)
        is_fully_verified = verified_count == total_count and total_count > 0
        
        return ApiResponse.ok({
            "isFullyVerified": is_fully_verified,
            "verifiedCount": verified_count,
            "totalCount": total_count
        })
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting gallery stats {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_gallery_stats")
