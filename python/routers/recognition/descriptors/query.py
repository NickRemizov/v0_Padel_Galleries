"""
Descriptor Query Endpoints

Endpoints:
- GET /missing-descriptors-count
- GET /missing-descriptors-list
"""

from fastapi import APIRouter

from core.config import VERSION
from core.responses import ApiResponse
from core.exceptions import DescriptorError
from core.logging import get_logger

from ..dependencies import get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


@router.get("/missing-descriptors-count")
async def get_missing_descriptors_count():
    """Get count of faces with person_id but no insightface_descriptor"""
    supabase_client = get_supabase_client()
    try:
        result = supabase_client.client.table("photo_faces").select(
            "id", count="exact"
        ).not_.is_("person_id", "null").is_("insightface_descriptor", "null").execute()
        
        count = result.count or 0
        logger.info(f"[v{VERSION}] Found {count} faces missing descriptors")
        
        return ApiResponse.ok({"count": count}).model_dump()
    except Exception as e:
        logger.error(f"[v{VERSION}] Error getting count: {str(e)}", exc_info=True)
        raise DescriptorError(f"Failed to count missing descriptors: {str(e)}")


@router.get("/missing-descriptors-list")
async def get_missing_descriptors_list():
    """Get list of faces with person_id but no insightface_descriptor"""
    supabase_client = get_supabase_client()
    try:
        result = supabase_client.client.table("photo_faces").select(
            "id, photo_id, person_id, insightface_bbox, "
            "people(real_name), "
            "gallery_images(image_url, original_filename, galleries(title))"
        ).not_.is_("person_id", "null").is_("insightface_descriptor", "null").execute()
        
        faces = result.data or []
        logger.info(f"[v{VERSION}] Found {len(faces)} faces missing descriptors")
        
        # Format for frontend
        formatted = []
        for face in faces:
            formatted.append({
                "face_id": face["id"],
                "photo_id": face["photo_id"],
                "person_id": face["person_id"],
                "person_name": face.get("people", {}).get("real_name", "Unknown") if face.get("people") else "Unknown",
                "filename": face.get("gallery_images", {}).get("original_filename", "Unknown") if face.get("gallery_images") else "Unknown",
                "gallery_name": face.get("gallery_images", {}).get("galleries", {}).get("title", "") if face.get("gallery_images") and face.get("gallery_images", {}).get("galleries") else "",
                "image_url": face.get("gallery_images", {}).get("image_url", "") if face.get("gallery_images") else "",
                "bbox": face.get("insightface_bbox")
            })
        
        return ApiResponse.ok({"faces": formatted, "count": len(formatted)}).model_dump()
    except Exception as e:
        logger.error(f"[v{VERSION}] Error getting list: {str(e)}", exc_info=True)
        raise DescriptorError(f"Failed to list missing descriptors: {str(e)}")
