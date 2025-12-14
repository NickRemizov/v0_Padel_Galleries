"""
Galleries API Router
CRUD operations for galleries
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

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
    shoot_date: str
    gallery_url: str
    cover_image_url: str
    cover_image_square_url: Optional[str] = None
    external_gallery_url: Optional[str] = None
    photographer_id: Optional[str] = None
    location_id: Optional[str] = None
    organizer_id: Optional[str] = None
    sort_order: Optional[str] = None


class GalleryUpdate(BaseModel):
    title: Optional[str] = None
    shoot_date: Optional[str] = None
    gallery_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    cover_image_square_url: Optional[str] = None
    external_gallery_url: Optional[str] = None
    photographer_id: Optional[str] = None
    location_id: Optional[str] = None
    organizer_id: Optional[str] = None
    sort_order: Optional[str] = None


@router.get("")
async def get_galleries(
    sort_by: str = Query("created_at", enum=["created_at", "shoot_date"]),
    with_relations: bool = Query(True)
):
    """Get all galleries."""
    try:
        select = "*"
        if with_relations:
            select = "*, photographers(id, name), locations(id, name), organizers(id, name), gallery_images(id)"
        
        result = supabase_db_instance.client.table("galleries").select(select).order(sort_by, desc=True).execute()
        galleries = result.data or []
        
        # Calculate photo_count from gallery_images
        for gallery in galleries:
            images = gallery.pop("gallery_images", None)
            gallery["photo_count"] = len(images) if images else 0
        
        return ApiResponse.ok(galleries)
    except Exception as e:
        logger.error(f"Error getting galleries: {e}")
        raise DatabaseError(str(e), operation="get_galleries")


@router.get("/{gallery_id}")
async def get_gallery(gallery_id: str):
    """Get a gallery by ID."""
    try:
        result = supabase_db_instance.client.table("galleries").select(
            "*, photographers(id, name), locations(id, name), organizers(id, name)"
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
        images_result = supabase_db_instance.client.table("gallery_images").select("id").eq("gallery_id", gallery_id).execute()
        image_ids = [img["id"] for img in (images_result.data or [])]
        
        if not image_ids:
            return ApiResponse.ok({
                "isFullyVerified": False,
                "verifiedCount": 0,
                "totalCount": 0
            })
        
        faces_result = supabase_db_instance.client.table("photo_faces").select(
            "photo_id, verified"
        ).in_("photo_id", image_ids).eq("verified", True).execute()
        
        verified_photo_ids = set(f["photo_id"] for f in (faces_result.data or []))
        verified_count = len(verified_photo_ids)
        total_count = len(image_ids)
        is_fully_verified = verified_count == total_count and total_count > 0
        
        return ApiResponse.ok({
            "isFullyVerified": is_fully_verified,
            "verifiedCount": verified_count,
            "totalCount": total_count
        })
    except Exception as e:
        logger.error(f"Error getting gallery stats {gallery_id}: {e}")
        raise DatabaseError(str(e), operation="get_gallery_stats")


@router.post("")
async def create_gallery(data: GalleryCreate):
    """Create a new gallery."""
    try:
        insert_data = data.model_dump(exclude_none=True)
        result = supabase_db_instance.client.table("galleries").insert(insert_data).execute()
        if result.data:
            logger.info(f"Created gallery: {data.title}")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_gallery")
    except Exception as e:
        logger.error(f"Error creating gallery: {e}")
        raise DatabaseError(str(e), operation="create_gallery")


@router.put("/{gallery_id}")
async def update_gallery(gallery_id: str, data: GalleryUpdate):
    """Update a gallery."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        
        result = supabase_db_instance.client.table("galleries").update(update_data).eq("id", gallery_id).execute()
        if result.data:
            logger.info(f"Updated gallery {gallery_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Gallery", gallery_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating gallery {gallery_id}: {e}")
        raise DatabaseError(str(e), operation="update_gallery")


@router.patch("/{gallery_id}/sort-order")
async def update_sort_order(gallery_id: str, sort_order: str = Query(...)):
    """Update gallery sort order."""
    try:
        supabase_db_instance.client.table("galleries").update({"sort_order": sort_order}).eq("id", gallery_id).execute()
        logger.info(f"Updated sort order for gallery {gallery_id}")
        return ApiResponse.ok({"updated": True})
    except Exception as e:
        logger.error(f"Error updating sort order: {e}")
        raise DatabaseError(str(e), operation="update_sort_order")


@router.delete("/{gallery_id}")
async def delete_gallery(gallery_id: str, delete_images: bool = Query(True)):
    """Delete a gallery and optionally all its images."""
    try:
        if delete_images:
            # Get all images in gallery
            images = supabase_db_instance.client.table("gallery_images").select("id").eq("gallery_id", gallery_id).execute()
            image_ids = [img["id"] for img in (images.data or [])]
            
            if image_ids:
                # Delete photo_faces for all images
                for img_id in image_ids:
                    supabase_db_instance.client.table("photo_faces").delete().eq("photo_id", img_id).execute()
                
                # Delete all images
                supabase_db_instance.client.table("gallery_images").delete().eq("gallery_id", gallery_id).execute()
                logger.info(f"Deleted {len(image_ids)} images from gallery {gallery_id}")
        
        # Delete gallery
        supabase_db_instance.client.table("galleries").delete().eq("id", gallery_id).execute()
        logger.info(f"Deleted gallery {gallery_id}")
        return ApiResponse.ok({"deleted": True})
    except Exception as e:
        logger.error(f"Error deleting gallery {gallery_id}: {e}")
        raise DatabaseError(str(e), operation="delete_gallery")
