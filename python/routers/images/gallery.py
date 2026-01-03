"""
Images Gallery Operations

Endpoints:
- GET /gallery/{gallery_id}           - Get all gallery images
- PATCH /gallery/{gallery_id}/sort-order - Update sort order
- DELETE /gallery/{gallery_id}/all    - Delete all gallery images
"""

from fastapi import APIRouter
import httpx
import os

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger

from .models import BatchSortOrderRequest
from .helpers import get_supabase_db, get_face_service

logger = get_logger(__name__)
router = APIRouter()


@router.get("/gallery/{gallery_id}")
async def get_gallery_images(gallery_id: str):
    """Получает все изображения галереи с счётчиками лайков и избранного."""
    supabase_db = get_supabase_db()

    try:
        logger.info(f"Getting images for gallery: {gallery_id}")

        result = supabase_db.client.table("gallery_images").select("*").eq("gallery_id", gallery_id).order("display_order").execute()

        images = result.data or []

        if images:
            image_ids = [img["id"] for img in images]

            # Get likes counts
            likes_result = supabase_db.client.table("likes").select("image_id").in_("image_id", image_ids).execute()
            likes_by_image = {}
            for like in (likes_result.data or []):
                img_id = like["image_id"]
                likes_by_image[img_id] = likes_by_image.get(img_id, 0) + 1

            # Get favorites counts
            favorites_result = supabase_db.client.table("favorites").select("gallery_image_id").in_("gallery_image_id", image_ids).execute()
            favorites_by_image = {}
            for fav in (favorites_result.data or []):
                img_id = fav["gallery_image_id"]
                favorites_by_image[img_id] = favorites_by_image.get(img_id, 0) + 1

            # Add counts to images
            for img in images:
                img["likes_count"] = likes_by_image.get(img["id"], 0)
                img["favorites_count"] = favorites_by_image.get(img["id"], 0)

        logger.info(f"Found {len(images)} images")
        return ApiResponse.ok(images)
        
    except Exception as e:
        logger.error(f"Error getting gallery images: {e}")
        raise DatabaseError(str(e), operation="get_gallery_images")


@router.patch("/gallery/{gallery_id}/sort-order")
async def update_images_sort_order(gallery_id: str, request: BatchSortOrderRequest):
    """Обновляет порядок изображений в галерее."""
    supabase_db = get_supabase_db()
    
    try:
        logger.info(f"Updating sort order for gallery {gallery_id}, {len(request.image_orders)} images")
        
        for item in request.image_orders:
            supabase_db.client.table("gallery_images").update({"display_order": item.order}).eq("id", item.id).eq("gallery_id", gallery_id).execute()
        
        logger.info("Sort order updated successfully")
        return ApiResponse.ok({"updated": True})
        
    except Exception as e:
        logger.error(f"Error updating sort order: {e}")
        raise DatabaseError(str(e), operation="update_sort_order")


@router.delete("/gallery/{gallery_id}/all")
async def delete_all_gallery_images(gallery_id: str):
    """Удаляет все фото из галереи."""
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    try:
        logger.info(f"Deleting all images from gallery: {gallery_id}")
        
        result = supabase_db.client.table("gallery_images").select("id, image_url").eq("gallery_id", gallery_id).execute()
        
        if not result.data:
            return ApiResponse.ok({
                "deleted_count": 0,
                "message": "No images to delete"
            })
        
        images = result.data
        image_ids = [img["id"] for img in images]

        # Get faces with descriptors and person_id before deletion (for index removal)
        faces_result = supabase_db.client.table("photo_faces").select(
            "id, insightface_descriptor, person_id"
        ).in_("photo_id", image_ids).execute()

        face_ids_in_index = [
            f["id"] for f in (faces_result.data or [])
            if f.get("insightface_descriptor") and f.get("person_id")
        ]
        has_descriptors = len(face_ids_in_index) > 0

        # Delete all images
        deleted_count = 0
        failed_count = 0

        for image in images:
            try:
                supabase_db.client.table("gallery_images").delete().eq("id", image["id"]).execute()
                deleted_count += 1

                # Delete blob
                image_url = image.get("image_url")
                if image_url:
                    try:
                        blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
                        if blob_token and image_url.startswith("https://"):
                            async with httpx.AsyncClient() as client:
                                await client.delete(
                                    image_url,
                                    headers={"Authorization": f"Bearer {blob_token}"}
                                )
                    except Exception:
                        pass

            except Exception as e:
                logger.error(f"Failed to delete image {image['id']}: {e}")
                failed_count += 1

        logger.info(f"Deleted {deleted_count} images, {failed_count} failed")

        # Remove faces from index
        index_rebuilt = False
        if face_ids_in_index and deleted_count > 0:
            try:
                result = await face_service.remove_faces_from_index(face_ids_in_index)
                index_rebuilt = result.get("deleted", 0) > 0
                logger.info(f"Removed {result.get('deleted', 0)} faces from index")
            except Exception as e:
                logger.error(f"Failed to update index: {e}")
        
        failed_msg = f", {failed_count} failed" if failed_count > 0 else ""
        return ApiResponse.ok({
            "deleted_count": deleted_count,
            "failed_count": failed_count,
            "had_descriptors": has_descriptors,
            "index_rebuilt": index_rebuilt,
            "message": f"Deleted {deleted_count} images{failed_msg}"
        })
        
    except Exception as e:
        logger.error(f"Error in batch delete: {e}")
        raise DatabaseError(str(e), operation="delete_all_gallery_images")
