"""
Images API Router
Gallery image management endpoints
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
import httpx
import os

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService

logger = get_logger(__name__)
router = APIRouter()

supabase_db: Optional[SupabaseDatabase] = None
face_service: Optional[FaceRecognitionService] = None


def set_services(db: SupabaseDatabase, face: FaceRecognitionService):
    """Inject services from main.py"""
    global supabase_db, face_service
    supabase_db = db
    face_service = face


# Request/Response Models

class GalleryImageInput(BaseModel):
    imageUrl: str
    originalUrl: str
    originalFilename: str
    fileSize: int
    width: int
    height: int


class BatchAddImagesRequest(BaseModel):
    galleryId: str
    images: List[GalleryImageInput]


class BatchSortOrderItem(BaseModel):
    id: str
    order: int


class BatchSortOrderRequest(BaseModel):
    image_orders: List[BatchSortOrderItem]


# Endpoints

@router.get("/gallery/{gallery_id}")
async def get_gallery_images(gallery_id: str):
    """Получает все изображения галереи."""
    try:
        logger.info(f"Getting images for gallery: {gallery_id}")
        
        result = supabase_db.client.table("gallery_images")\
            .select("*")\
            .eq("gallery_id", gallery_id)\
            .order("display_order")\
            .execute()
        
        images = result.data or []
        logger.info(f"Found {len(images)} images")
        return ApiResponse.ok(images)
        
    except Exception as e:
        logger.error(f"Error getting gallery images: {e}")
        raise DatabaseError(str(e), operation="get_gallery_images")


@router.patch("/gallery/{gallery_id}/sort-order")
async def update_images_sort_order(gallery_id: str, request: BatchSortOrderRequest):
    """Обновляет порядок изображений в галерее."""
    try:
        logger.info(f"Updating sort order for gallery {gallery_id}, {len(request.image_orders)} images")
        
        for item in request.image_orders:
            supabase_db.client.table("gallery_images")\
                .update({"display_order": item.order})\
                .eq("id", item.id)\
                .eq("gallery_id", gallery_id)\
                .execute()
        
        logger.info("Sort order updated successfully")
        return ApiResponse.ok({"updated": True})
        
    except Exception as e:
        logger.error(f"Error updating sort order: {e}")
        raise DatabaseError(str(e), operation="update_sort_order")


@router.delete("/{image_id}")
async def delete_image(image_id: str):
    """Удаляет фото и все связанные данные."""
    try:
        logger.info(f"Deleting image: {image_id}")
        
        # Get image URL for blob deletion
        result = supabase_db.client.table("gallery_images")\
            .select("image_url")\
            .eq("id", image_id)\
            .execute()
        
        if not result.data:
            raise NotFoundError("Image", image_id)
        
        image_url = result.data[0].get("image_url")
        
        # Check for descriptors
        descriptors_result = supabase_db.client.table("photo_faces")\
            .select("id, insightface_descriptor")\
            .eq("photo_id", image_id)\
            .execute()
        
        has_descriptors = any(
            face.get("insightface_descriptor") is not None and face.get("insightface_descriptor") != ""
            for face in (descriptors_result.data or [])
        )
        
        # Delete from DB (CASCADE deletes photo_faces)
        supabase_db.client.table("gallery_images")\
            .delete()\
            .eq("id", image_id)\
            .execute()
        
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


@router.delete("/gallery/{gallery_id}/all")
async def delete_all_gallery_images(gallery_id: str):
    """Удаляет все фото из галереи."""
    try:
        logger.info(f"Deleting all images from gallery: {gallery_id}")
        
        result = supabase_db.client.table("gallery_images")\
            .select("id, image_url")\
            .eq("gallery_id", gallery_id)\
            .execute()
        
        if not result.data:
            return ApiResponse.ok({
                "deleted_count": 0,
                "message": "No images to delete"
            })
        
        images = result.data
        image_ids = [img["id"] for img in images]
        
        # Check for descriptors
        descriptors_result = supabase_db.client.table("photo_faces")\
            .select("id, insightface_descriptor")\
            .in_("photo_id", image_ids)\
            .execute()
        
        has_descriptors = any(
            face.get("insightface_descriptor") is not None and face.get("insightface_descriptor") != ""
            for face in (descriptors_result.data or [])
        )
        
        # Delete all images
        deleted_count = 0
        failed_count = 0
        
        for image in images:
            try:
                supabase_db.client.table("gallery_images")\
                    .delete()\
                    .eq("id", image["id"])\
                    .execute()
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
        
        # Rebuild index if had descriptors
        index_rebuilt = False
        if has_descriptors and deleted_count > 0:
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_rebuilt = True
                    logger.info("Index rebuilt successfully")
            except Exception as e:
                logger.error(f"Failed to rebuild index: {e}")
        
        return ApiResponse.ok({
            "deleted_count": deleted_count,
            "failed_count": failed_count,
            "had_descriptors": has_descriptors,
            "index_rebuilt": index_rebuilt,
            "message": f"Deleted {deleted_count} images" + (f", {failed_count} failed" if failed_count > 0 else "")
        })
        
    except Exception as e:
        logger.error(f"Error in batch delete: {e}")
        raise DatabaseError(str(e), operation="delete_all_gallery_images")


@router.post("/batch-add")
async def batch_add_images(request: BatchAddImagesRequest):
    """Добавляет несколько фото в галерею."""
    try:
        logger.info(f"Adding {len(request.images)} images to gallery {request.galleryId}")
        
        # Get max display_order
        max_order_result = supabase_db.client.table("gallery_images")\
            .select("display_order")\
            .eq("gallery_id", request.galleryId)\
            .order("display_order", desc=True)\
            .limit(1)\
            .execute()
        
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


@router.patch("/{image_id}/mark-processed")
async def mark_image_as_processed(image_id: str):
    """Помечает фото как обработанное."""
    try:
        logger.info(f"Marking image {image_id} as processed")
        
        result = supabase_db.client.table("gallery_images")\
            .update({"has_been_processed": True})\
            .eq("id", image_id)\
            .execute()
        
        if not result.data:
            raise NotFoundError("Image", image_id)
        
        logger.info(f"Image {image_id} marked as processed")
        return ApiResponse.ok({"processed": True})
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error marking image as processed: {e}")
        raise DatabaseError(str(e), operation="mark_processed")


@router.get("/{image_id}/people")
async def get_image_verified_people(image_id: str):
    """Получает список верифицированных людей на фото."""
    try:
        logger.info(f"Getting verified people for image: {image_id}")
        
        result = supabase_db.client.table("photo_faces")\
            .select("person_id, people!inner(id, real_name, telegram_name)")\
            .eq("photo_id", image_id)\
            .eq("verified", True)\
            .execute()
        
        people = []
        for item in (result.data or []):
            person_data = item.get("people", {})
            people.append({
                "id": person_data.get("id"),
                "name": person_data.get("real_name") or person_data.get("telegram_name") or "Unknown"
            })
        
        logger.info(f"Found {len(people)} verified people on image")
        return ApiResponse.ok(people)
        
    except Exception as e:
        logger.error(f"Error getting verified people: {e}")
        raise DatabaseError(str(e), operation="get_verified_people")
