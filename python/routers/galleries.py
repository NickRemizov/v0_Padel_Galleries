from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from services.supabase_database import SupabaseDatabase
import logging

logger = logging.getLogger(__name__)
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
        return {"success": True, "data": result.data or []}
    except Exception as e:
        logger.error(f"[Galleries API] Error: {e}")
        return {"success": False, "error": str(e), "data": []}


@router.get("/{gallery_id}")
async def get_gallery(gallery_id: str):
    """Get a gallery by ID."""
    try:
        result = supabase_db_instance.client.table("galleries").select(
            "*, photographers(id, name), locations(id, name), organizers(id, name)"
        ).eq("id", gallery_id).execute()
        if result.data and len(result.data) > 0:
            return {"success": True, "data": result.data[0]}
        raise HTTPException(status_code=404, detail="Gallery not found")
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/{gallery_id}/stats")
async def get_gallery_stats(gallery_id: str):
    """Get face recognition stats for a gallery."""
    try:
        images_result = supabase_db_instance.client.table("gallery_images").select("id").eq("gallery_id", gallery_id).execute()
        image_ids = [img["id"] for img in (images_result.data or [])]
        
        if not image_ids:
            return {
                "success": True, 
                "data": {
                    "isFullyVerified": False,
                    "verifiedCount": 0,
                    "totalCount": 0
                }
            }
        
        faces_result = supabase_db_instance.client.table("photo_faces").select(
            "photo_id, verified"
        ).in_("photo_id", image_ids).eq("verified", True).execute()
        
        verified_photo_ids = set(f["photo_id"] for f in (faces_result.data or []))
        verified_count = len(verified_photo_ids)
        total_count = len(image_ids)
        is_fully_verified = verified_count == total_count and total_count > 0
        
        return {
            "success": True,
            "data": {
                "isFullyVerified": is_fully_verified,
                "verifiedCount": verified_count,
                "totalCount": total_count
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("")
async def create_gallery(data: GalleryCreate):
    """Create a new gallery."""
    try:
        insert_data = data.model_dump(exclude_none=True)
        result = supabase_db_instance.client.table("galleries").insert(insert_data).execute()
        if result.data:
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.put("/{gallery_id}")
async def update_gallery(gallery_id: str, data: GalleryUpdate):
    """Update a gallery."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            return {"success": False, "error": "No fields to update"}
        result = supabase_db_instance.client.table("galleries").update(update_data).eq("id", gallery_id).execute()
        if result.data:
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.patch("/{gallery_id}/sort-order")
async def update_sort_order(gallery_id: str, sort_order: str = Query(...)):
    """Update gallery sort order."""
    try:
        supabase_db_instance.client.table("galleries").update({"sort_order": sort_order}).eq("id", gallery_id).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/{gallery_id}")
async def delete_gallery(gallery_id: str, delete_images: bool = Query(True)):
    """Delete a gallery."""
    try:
        if delete_images:
            images = supabase_db_instance.client.table("gallery_images").select("id").eq("gallery_id", gallery_id).execute()
            image_ids = [img["id"] for img in (images.data or [])]
            
            if image_ids:
                for img_id in image_ids:
                    supabase_db_instance.client.table("photo_faces").delete().eq("photo_id", img_id).execute()
                supabase_db_instance.client.table("gallery_images").delete().eq("gallery_id", gallery_id).execute()
        
        supabase_db_instance.client.table("galleries").delete().eq("id", gallery_id).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
