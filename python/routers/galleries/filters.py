"""
Galleries Filter Endpoints

Endpoints:
- GET /with-unprocessed-photos  - Galleries with unprocessed photos
- GET /with-unverified-faces    - Galleries with unverified faces
- GET /with-unrecognized-faces  - Alias for with-unverified-faces
"""

from fastapi import APIRouter

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger

from .helpers import get_supabase_db

logger = get_logger(__name__)
router = APIRouter()


@router.get("/with-unprocessed-photos")
async def get_galleries_with_unprocessed_photos():
    """Get galleries that have unprocessed photos (has_been_processed = false or null)."""
    supabase_db = get_supabase_db()
    
    try:
        galleries_result = supabase_db.client.table("galleries").select(
            "id, title, shoot_date, slug"
        ).order("shoot_date", desc=True).execute()
        
        galleries = galleries_result.data or []
        if not galleries:
            return ApiResponse.ok([])
        
        result = []
        for gallery in galleries:
            total_result = supabase_db.client.table("gallery_images").select(
                "id", count="exact"
            ).eq("gallery_id", gallery["id"]).execute()
            total_count = total_result.count or 0
            
            unprocessed_result = supabase_db.client.table("gallery_images").select(
                "id", count="exact"
            ).eq("gallery_id", gallery["id"]).or_(
                "has_been_processed.is.null,has_been_processed.eq.false"
            ).execute()
            unprocessed_count = unprocessed_result.count or 0
            
            if unprocessed_count > 0:
                result.append({
                    "id": gallery["id"],
                    "slug": gallery.get("slug"),
                    "title": gallery["title"],
                    "shoot_date": gallery["shoot_date"],
                    "total_photos": total_count,
                    "unprocessed_photos": unprocessed_count
                })
        
        logger.info(f"Found {len(result)} galleries with unprocessed photos")
        return ApiResponse.ok(result)
    except Exception as e:
        logger.error(f"Error getting galleries with unprocessed photos: {e}")
        raise DatabaseError(str(e), operation="get_galleries_with_unprocessed_photos")


@router.get("/with-unverified-faces")
async def get_galleries_with_unverified_faces():
    """Get galleries that have photos NOT fully verified."""
    supabase_db = get_supabase_db()
    
    try:
        galleries_result = supabase_db.client.table("galleries").select(
            "id, title, shoot_date, slug"
        ).order("shoot_date", desc=True).execute()
        
        galleries = galleries_result.data or []
        if not galleries:
            return ApiResponse.ok([])
        
        result = []
        for gallery in galleries:
            photos_result = supabase_db.client.table("gallery_images").select(
                "id"
            ).eq("gallery_id", gallery["id"]).execute()
            
            photos = photos_result.data or []
            if not photos:
                continue
            
            total_count = len(photos)
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
            
            unverified_count = total_count - len(fully_verified_photo_ids)
            
            if unverified_count > 0:
                result.append({
                    "id": gallery["id"],
                    "slug": gallery.get("slug"),
                    "title": gallery["title"],
                    "shoot_date": gallery["shoot_date"],
                    "total_photos": total_count,
                    "unverified_photos": unverified_count
                })
        
        logger.info(f"Found {len(result)} galleries with unverified faces")
        return ApiResponse.ok(result)
    except Exception as e:
        logger.error(f"Error getting galleries with unverified faces: {e}")
        raise DatabaseError(str(e), operation="get_galleries_with_unverified_faces")


@router.get("/with-unrecognized-faces")
async def get_galleries_with_unrecognized_faces():
    """Alias for with-unverified-faces (backward compatibility)."""
    return await get_galleries_with_unverified_faces()
