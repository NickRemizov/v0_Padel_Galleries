"""
Galleries Photo Operations

Endpoints:
- GET /{id}/unprocessed-photos  - Get unprocessed photos
- GET /{id}/unverified-photos   - Get unverified photos
- GET /{id}/unrecognized-photos - Alias for unverified-photos
- POST /batch-delete-images     - Batch delete images
"""

from fastapi import APIRouter

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger

from .models import BatchDeleteImagesRequest
from .helpers import get_supabase_db, get_face_service, _get_gallery_id

logger = get_logger(__name__)
router = APIRouter()


@router.get("/{identifier}/unprocessed-photos")
async def get_gallery_unprocessed_photos(identifier: str):
    """Get unprocessed photos from a gallery for recognition."""
    supabase_db = get_supabase_db()
    
    try:
        gallery_id = _get_gallery_id(identifier)
        
        result = supabase_db.client.table("gallery_images").select(
            "id, image_url, original_filename, slug"
        ).eq("gallery_id", gallery_id).or_(
            "has_been_processed.is.null,has_been_processed.eq.false"
        ).order("original_filename").execute()
        
        images = result.data or []
        logger.info(f"Found {len(images)} unprocessed photos in gallery {gallery_id}")
        return ApiResponse.ok(images)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting unprocessed photos for gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_gallery_unprocessed_photos")


@router.get("/{identifier}/unverified-photos")
async def get_gallery_unverified_photos(identifier: str):
    """Get photos from a gallery that are NOT fully verified."""
    supabase_db = get_supabase_db()
    
    try:
        gallery_id = _get_gallery_id(identifier)
        
        photos_result = supabase_db.client.table("gallery_images").select(
            "id, image_url, original_filename, slug"
        ).eq("gallery_id", gallery_id).order("original_filename").execute()
        
        photos = photos_result.data or []
        if not photos:
            return ApiResponse.ok([])
        
        photo_ids = [p["id"] for p in photos]
        
        all_faces_result = supabase_db.client.table("photo_faces").select(
            "photo_id, recognition_confidence"
        ).in_("photo_id", photo_ids).execute()
        
        all_faces = all_faces_result.data or []
        
        faces_by_photo = {}
        for face in all_faces:
            pid = face["photo_id"]
            if pid not in faces_by_photo:
                faces_by_photo[pid] = []
            faces_by_photo[pid].append(face)
        
        fully_verified_photo_ids = set()
        for photo_id, faces in faces_by_photo.items():
            if len(faces) > 0 and all(f.get("recognition_confidence") == 1 for f in faces):
                fully_verified_photo_ids.add(photo_id)
        
        result = [p for p in photos if p["id"] not in fully_verified_photo_ids]
        
        logger.info(f"Found {len(result)} unverified photos in gallery {gallery_id}")
        return ApiResponse.ok(result)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting unverified photos for gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_gallery_unverified_photos")


@router.get("/{identifier}/unrecognized-photos")
async def get_gallery_unrecognized_photos(identifier: str):
    """Alias for unverified-photos (backward compatibility)."""
    return await get_gallery_unverified_photos(identifier)


@router.post("/batch-delete-images")
async def batch_delete_gallery_images(data: BatchDeleteImagesRequest):
    """Batch delete multiple images from a gallery."""
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    try:
        image_ids = data.image_ids
        gallery_id = data.gallery_id
        
        if not image_ids:
            return ApiResponse.ok({
                "deleted_count": 0,
                "had_verified_faces": False,
                "index_rebuilt": False
            })
        
        logger.info(f"Batch deleting {len(image_ids)} images from gallery {gallery_id}")

        # Get face_ids with descriptors and person_id before deletion (for index removal)
        faces_result = supabase_db.client.table("photo_faces").select(
            "id, insightface_descriptor, person_id"
        ).in_("photo_id", image_ids).execute()

        face_ids_in_index = [
            f["id"] for f in (faces_result.data or [])
            if f.get("insightface_descriptor") and f.get("person_id")
        ]

        supabase_db.client.table("photo_faces").delete().in_("photo_id", image_ids).execute()

        delete_result = supabase_db.client.table("gallery_images").delete().in_(
            "id", image_ids
        ).eq("gallery_id", gallery_id).execute()

        deleted_count = len(delete_result.data) if delete_result.data else 0
        logger.info(f"Deleted {deleted_count} images from gallery {gallery_id}")

        index_rebuilt = False
        if face_ids_in_index and face_service:
            try:
                result = await face_service.remove_faces_from_index(face_ids_in_index)
                index_rebuilt = result.get("deleted", 0) > 0
                logger.info(f"Removed {result.get('deleted', 0)} faces from index")
            except Exception as e:
                logger.error(f"Failed to update index: {e}")
        
        return ApiResponse.ok({
            "deleted_count": deleted_count,
            "had_verified_faces": len(face_ids_in_index) > 0,
            "index_rebuilt": index_rebuilt
        })
    except Exception as e:
        logger.error(f"Error batch deleting images: {e}")
        raise DatabaseError(str(e), operation="batch_delete_gallery_images")
