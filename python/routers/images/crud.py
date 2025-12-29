"""
Images CRUD Operations

Endpoints:
- DELETE /{image_id}  - Delete single image
- POST /batch-add     - Batch add images
"""

from fastapi import APIRouter
import httpx
import os

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger

from .models import BatchAddImagesRequest
from .helpers import get_supabase_db, get_face_service

logger = get_logger(__name__)
router = APIRouter()


@router.post("/batch-add")
async def batch_add_images(request: BatchAddImagesRequest):
    """Добавляет несколько фото в галерею."""
    supabase_db = get_supabase_db()
    
    try:
        logger.info(f"Adding {len(request.images)} images to gallery {request.galleryId}")
        
        # Get max display_order
        max_order_result = supabase_db.client.table("gallery_images").select("display_order").eq("gallery_id", request.galleryId).order("display_order", desc=True).limit(1).execute()
        
        start_order = max_order_result.data[0]["display_order"] + 1 if max_order_result.data else 0
        
        images_to_insert = [
            {
                "gallery_id": request.galleryId,
                "image_url": img.imageUrl,
                "original_url": img.originalUrl,
                "original_filename": img.originalFilename,
                "width": img.width,
                "height": img.height,
                "file_size": img.fileSize,
                "display_order": start_order + idx
            }
            for idx, img in enumerate(request.images)
        ]
        
        result = supabase_db.client.table("gallery_images").insert(images_to_insert).execute()
        
        inserted_count = len(result.data) if result.data else 0
        logger.info(f"Successfully inserted {inserted_count} images")
        
        return ApiResponse.ok({
            "inserted_count": inserted_count,
            "message": f"Successfully added {inserted_count} images"
        })
        
    except Exception as e:
        logger.error(f"Error in batch add: {e}")
        raise DatabaseError(str(e), operation="batch_add_images")


@router.delete("/{image_id}")
async def delete_image(image_id: str):
    """Удаляет фото и все связанные данные."""
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    try:
        logger.info(f"Deleting image: {image_id}")
        
        # Get image URL for blob deletion
        result = supabase_db.client.table("gallery_images").select("image_url").eq("id", image_id).execute()
        
        if not result.data:
            raise NotFoundError("Image", image_id)
        
        image_url = result.data[0].get("image_url")
        
        # Check for descriptors
        descriptors_result = supabase_db.client.table("photo_faces").select("id, insightface_descriptor").eq("photo_id", image_id).execute()
        
        has_descriptors = any(
            face.get("insightface_descriptor") is not None and face.get("insightface_descriptor") != ""
            for face in (descriptors_result.data or [])
        )
        
        # Delete from DB (CASCADE deletes photo_faces)
        supabase_db.client.table("gallery_images").delete().eq("id", image_id).execute()
        
        logger.info("Image deleted from DB")
        
        # Delete blob file
        if image_url:
            try:
                blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
                if blob_token and image_url.startswith("https://"):
                    async with httpx.AsyncClient() as client:
                        delete_response = await client.delete(
                            image_url,
                            headers={"Authorization": f"Bearer {blob_token}"}
                        )
                        if delete_response.status_code in [200, 204]:
                            logger.info("Blob file deleted")
            except Exception as e:
                logger.warning(f"Failed to delete blob: {e}")
        
        # Rebuild index if had descriptors
        index_rebuilt = False
        if has_descriptors:
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_rebuilt = True
                    logger.info("Index rebuilt successfully")
            except Exception as e:
                logger.error(f"Failed to rebuild index: {e}")
        
        return ApiResponse.ok({
            "deleted": True,
            "had_descriptors": has_descriptors,
            "index_rebuilt": index_rebuilt
        })
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting image: {e}")
        raise DatabaseError(str(e), operation="delete_image")
