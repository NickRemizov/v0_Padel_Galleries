"""
Galleries API Router
CRUD operations for galleries
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from datetime import date

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)
router = APIRouter()

supabase_db_instance: SupabaseDatabase = None


def set_services(supabase_db: SupabaseDatabase):
    global supabase_db_instance
    supabase_db_instance = supabase_db


class GalleryCreate(BaseModel):
    title: str
    slug: str
    description: Optional[str] = None
    shoot_date: Optional[date] = None
    location_id: Optional[str] = None
    organizer_id: Optional[str] = None
    photographer_id: Optional[str] = None
    is_public: Optional[bool] = False


class GalleryUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    shoot_date: Optional[date] = None
    location_id: Optional[str] = None
    organizer_id: Optional[str] = None
    photographer_id: Optional[str] = None
    is_public: Optional[bool] = None


@router.get("")
async def get_galleries(limit: int = 50, offset: int = 0, with_photo_count: bool = False):
    """Get galleries with related data."""
    try:
        result = supabase_db_instance.client.table("galleries").select(
            "*, locations(id, name), organizers(id, name), photographers(id, name)"
        ).order("shoot_date", desc=True).range(offset, offset + limit - 1).execute()
        
        galleries = result.data or []
        
        # Add photo_count if requested
        if with_photo_count and galleries:
            # Get photo count for each gallery using exact count
            for gallery in galleries:
                count_result = supabase_db_instance.client.table("gallery_images").select(
                    "id", count="exact"
                ).eq("gallery_id", gallery["id"]).execute()
                gallery["photo_count"] = count_result.count or 0
        
        return ApiResponse.ok(galleries)
    except Exception as e:
        logger.error(f"Error getting galleries: {e}")
        raise DatabaseError(str(e), operation="get_galleries")


@router.get("/{gallery_id}")
async def get_gallery(gallery_id: str):
    """Get a gallery by ID with full details."""
    try:
        result = supabase_db_instance.client.table("galleries").select(
            "*, locations(id, name), organizers(id, name), photographers(id, name)"
        ).eq("id", gallery_id).execute()
        if result.data and len(result.data) > 0:
            gallery = result.data[0]
            
            # Add photo count
            count_result = supabase_db_instance.client.table("gallery_images").select(
                "id", count="exact"
            ).eq("gallery_id", gallery_id).execute()
            gallery["photo_count"] = count_result.count or 0
            
            return ApiResponse.ok(gallery)
        raise NotFoundError("Gallery", gallery_id)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting gallery {gallery_id}: {e}")
        raise DatabaseError(str(e), operation="get_gallery")


@router.get("/{gallery_id}/stats")
async def get_gallery_stats(gallery_id: str):
    """Get face recognition stats for a gallery."""
    try:
        # Get all images in gallery
        images_result = supabase_db_instance.client.table("gallery_images").select(
            "id", count="exact"
        ).eq("gallery_id", gallery_id).execute()
        
        total_count = images_result.count or 0
        
        if total_count == 0:
            return ApiResponse.ok({
                "totalCount": 0,
                "verifiedCount": 0,
                "isFullyVerified": False
            })
        
        # Get image IDs
        images_data = supabase_db_instance.client.table("gallery_images").select(
            "id"
        ).eq("gallery_id", gallery_id).execute()
        
        image_ids = [img["id"] for img in (images_data.data or [])]
        
        if not image_ids:
            return ApiResponse.ok({
                "totalCount": 0,
                "verifiedCount": 0,
                "isFullyVerified": False
            })
        
        # Count images that have at least one verified face
        # An image is "verified" if it has at least one verified face OR has been manually marked as having no faces
        verified_faces_result = supabase_db_instance.client.table("photo_faces").select(
            "photo_id"
        ).in_("photo_id", image_ids).eq("verified", True).execute()
        
        # Get unique photo_ids with verified faces
        verified_photo_ids = set(face["photo_id"] for face in (verified_faces_result.data or []))
        verified_count = len(verified_photo_ids)
        
        is_fully_verified = verified_count == total_count and total_count > 0
        
        return ApiResponse.ok({
            "totalCount": total_count,
            "verifiedCount": verified_count,
            "isFullyVerified": is_fully_verified
        })
        
    except Exception as e:
        logger.error(f"Error getting gallery stats {gallery_id}: {e}")
        raise DatabaseError(str(e), operation="get_gallery_stats")


@router.post("")
async def create_gallery(data: GalleryCreate):
    """Create a new gallery."""
    try:
        insert_data = data.model_dump(exclude_none=True)
        # Convert date to string for JSON
        if 'shoot_date' in insert_data and insert_data['shoot_date']:
            insert_data['shoot_date'] = insert_data['shoot_date'].isoformat()
        
        result = supabase_db_instance.client.table("galleries").insert(insert_data).execute()
        if result.data:
            logger.info(f"Created gallery: {data.title}")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_gallery")
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error creating gallery: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Галерея с таким slug уже существует", field="slug")
        raise DatabaseError(error_str, operation="create_gallery")


@router.put("/{gallery_id}")
async def update_gallery(gallery_id: str, data: GalleryUpdate):
    """Update a gallery."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        
        # Convert date to string for JSON
        if 'shoot_date' in update_data and update_data['shoot_date']:
            update_data['shoot_date'] = update_data['shoot_date'].isoformat()
            
        result = supabase_db_instance.client.table("galleries").update(update_data).eq("id", gallery_id).execute()
        if result.data:
            logger.info(f"Updated gallery {gallery_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Gallery", gallery_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error updating gallery {gallery_id}: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Галерея с таким slug уже существует", field="slug")
        raise DatabaseError(error_str, operation="update_gallery")


@router.delete("/{gallery_id}")
async def delete_gallery(gallery_id: str):
    """Delete a gallery."""
    try:
        supabase_db_instance.client.table("galleries").delete().eq("id", gallery_id).execute()
        logger.info(f"Deleted gallery {gallery_id}")
        return ApiResponse.ok({"deleted": True})
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error deleting gallery {gallery_id}: {e}")
        if "23503" in error_str or "foreign key" in error_str.lower():
            raise ValidationError("Невозможно удалить: есть фотографии в галерее")
        raise DatabaseError(error_str, operation="delete_gallery")
