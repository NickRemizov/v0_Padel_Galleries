"""
Admin API - Check Gallery Endpoint
Check gallery status and search galleries
"""

from typing import Optional
from fastapi import APIRouter

from core.responses import ApiResponse
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)
router = APIRouter()


def get_supabase_db() -> SupabaseDatabase:
    from . import supabase_db_instance
    return supabase_db_instance


@router.get("/check-gallery")
async def check_gallery(id: Optional[str] = None, search: Optional[str] = None, all: bool = False):
    """
    Check gallery status and search galleries.
    
    Migrated from: app/api/admin/check-gallery/route.ts
    
    - all=true: list all galleries with photo counts
    - id=xxx: check specific gallery stats
    - search=xxx: search galleries by title
    """
    supabase_db = get_supabase_db()
    if not supabase_db:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db.client
        
        if all:
            galleries_result = client.table("galleries").select(
                "id, slug, title, shoot_date, created_at"
            ).order("shoot_date", desc=True).limit(50).execute()
            galleries = galleries_result.data or []
            
            galleries_with_counts = []
            for g in galleries:
                count_result = client.table("gallery_images").select("*", count="exact", head=True).eq("gallery_id", g["id"]).execute()
                galleries_with_counts.append({
                    **g,
                    "photo_count": count_result.count or 0
                })
            
            return ApiResponse.ok({
                "galleries": galleries_with_counts,
                "total": len(galleries_with_counts)
            }).model_dump()
        
        if id:
            gallery_result = client.table("galleries").select("id, slug, title, shoot_date").eq("id", id).single().execute()
            if not gallery_result.data:
                return ApiResponse.fail("Gallery not found", code="NOT_FOUND").model_dump()
            
            gallery = gallery_result.data
            
            images_result = client.table("gallery_images").select("id, has_been_processed").eq("gallery_id", id).execute()
            images = images_result.data or []
            image_ids = [img["id"] for img in images]
            
            faces = []
            if image_ids:
                faces_result = client.table("photo_faces").select(
                    "photo_id, person_id, recognition_confidence, verified"
                ).in_("photo_id", image_ids).execute()
                faces = faces_result.data or []
            
            stats = {
                "total_photos": len(images),
                "processed_photos": len([img for img in images if img["has_been_processed"]]),
                "total_faces": len(faces),
                "faces_with_person": len([f for f in faces if f.get("person_id")]),
                "faces_conf_1": len([f for f in faces if f.get("recognition_confidence") == 1]),
                "faces_conf_null": len([f for f in faces if f.get("recognition_confidence") is None]),
                "faces_conf_null_with_person": len([f for f in faces if f.get("recognition_confidence") is None and f.get("person_id")])
            }
            
            return ApiResponse.ok({"gallery": gallery, "stats": stats}).model_dump()
        
        # Search galleries
        search_term = search or "дружеск"
        galleries_result = client.table("galleries").select(
            "id, slug, title, shoot_date, created_at"
        ).or_(f"title.ilike.%{search_term}%,title.ilike.%Дружеск%,title.ilike.%дружеск%").order("shoot_date", desc=True).limit(20).execute()
        galleries = galleries_result.data or []
        
        galleries_with_counts = []
        for g in galleries:
            count_result = client.table("gallery_images").select("*", count="exact", head=True).eq("gallery_id", g["id"]).execute()
            galleries_with_counts.append({
                **g,
                "photo_count": count_result.count or 0
            })
        
        return ApiResponse.ok({
            "galleries": galleries_with_counts,
            "searchTerm": search_term,
            "found": len(galleries_with_counts)
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in check-gallery: {e}", exc_info=True)
        return ApiResponse.fail(f"Check failed: {str(e)}", code="CHECK_ERROR").model_dump()
