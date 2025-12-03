from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService
import httpx
import os
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Глобальные сервисы будут инжектированы из main.py
supabase_db: Optional[SupabaseDatabase] = None
face_service: Optional[FaceRecognitionService] = None

def set_services(db: SupabaseDatabase, face: FaceRecognitionService):
    """Инжектирует сервисы из main.py"""
    global supabase_db, face_service
    supabase_db = db
    face_service = face

class DeleteImageResponse(BaseModel):
    success: bool
    message: str
    had_descriptors: bool
    index_rebuilt: bool

class BatchDeleteResponse(BaseModel):
    success: bool
    deleted_count: int
    failed_count: int
    had_descriptors: bool
    index_rebuilt: bool
    message: str

class GalleryImageInput(BaseModel):
    imageUrl: str
    originalUrl: str
    originalFilename: str
    fileSize: int
    width: int
    height: int

class BatchAddImagesRequest(BaseModel):
    galleryId: str
    images: list[GalleryImageInput]

class BatchAddImagesResponse(BaseModel):
    success: bool
    inserted_count: int
    message: str

class MarkProcessedResponse(BaseModel):
    success: bool
    message: str

@router.delete("/{image_id}", response_model=DeleteImageResponse)
async def delete_image(image_id: str):
    """
    Удаляет фото и все связанные данные (photo_faces, face_descriptors через CASCADE).
    Автоматически перестраивает индекс если были дескрипторы.
    """
    logger.info("=" * 80)
    logger.info(f"[Images API] ===== DELETE REQUEST RECEIVED =====")
    logger.info(f"[Images API] Deleting image: {image_id}")
    
    try:
        # 1. Получаем URL фото для удаления из blob
        result = supabase_db.client.table("gallery_images")\
            .select("image_url")\
            .eq("id", image_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Image not found")
        
        image_url = result.data[0].get("image_url")
        
        # 2. Проверяем есть ли дескрипторы у этого фото
        descriptors_result = supabase_db.client.table("photo_faces")\
            .select("id, insightface_descriptor")\
            .eq("photo_id", image_id)\
            .execute()
        
        has_descriptors = any(
            face.get("insightface_descriptor") is not None and face.get("insightface_descriptor") != ""
            for face in (descriptors_result.data or [])
        )
        
        logger.info(f"[Images API] Image has descriptors: {has_descriptors}")
        
        # 3. Удаляем запись из gallery_images
        # CASCADE автоматически удалит photo_faces и face_descriptors
        delete_result = supabase_db.client.table("gallery_images")\
            .delete()\
            .eq("id", image_id)\
            .execute()
        
        logger.info(f"[Images API] ✓ Image deleted from DB")
        
        # 4. Удаляем blob файл
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
                            logger.info(f"[Images API] ✓ Blob file deleted")
                        else:
                            logger.warning(f"[Images API] Warning: Blob delete returned {delete_response.status_code}")
            except Exception as e:
                logger.warning(f"[Images API] Warning: Failed to delete blob: {e}")
        
        # 5. Перестраиваем индекс если были дескрипторы
        index_rebuilt = False
        if has_descriptors:
            try:
                pre_count = len(face_service.player_ids_map) if face_service.player_ids_map else 0
                logger.info(f"[Images API] Rebuilding index (current size: {pre_count})...")
                
                rebuild_result = await face_service.rebuild_players_index()
                
                if rebuild_result.get("success"):
                    post_count = rebuild_result.get('new_descriptor_count', 0)
                    logger.info(f"[Images API] ✓ Index rebuilt: {pre_count} -> {post_count} descriptors")
                    index_rebuilt = True
                else:
                    logger.error(f"[Images API] Index rebuild failed: {rebuild_result.get('error')}")
            except Exception as e:
                logger.error(f"[Images API] Warning: Failed to rebuild index: {e}", exc_info=True)
        
        logger.info("[Images API] ===== DELETE REQUEST COMPLETE =====")
        logger.info("=" * 80)
        
        return DeleteImageResponse(
            success=True,
            message="Image deleted successfully",
            had_descriptors=has_descriptors,
            index_rebuilt=index_rebuilt
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Images API] Error deleting image: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/gallery/{gallery_id}/all", response_model=BatchDeleteResponse)
async def delete_all_gallery_images(gallery_id: str):
    """
    Удаляет все фото из галереи и автоматически перестраивает индекс.
    """
    try:
        logger.info("=" * 80)
        logger.info(f"[Images API] ===== DELETE ALL REQUEST RECEIVED =====")
        logger.info(f"[Images API] Deleting all images from gallery: {gallery_id}")
        
        # 1. Получаем все фото из галереи
        result = supabase_db.client.table("gallery_images")\
            .select("id, image_url")\
            .eq("gallery_id", gallery_id)\
            .execute()
        
        if not result.data:
            return BatchDeleteResponse(
                success=True,
                deleted_count=0,
                failed_count=0,
                had_descriptors=False,
                index_rebuilt=False,
                message="No images to delete"
            )
        
        images = result.data
        logger.info(f"[Images API] Found {len(images)} images to delete")
        
        # 2. Проверяем есть ли дескрипторы у любого фото
        image_ids = [img["id"] for img in images]
        descriptors_result = supabase_db.client.table("photo_faces")\
            .select("id, insightface_descriptor")\
            .in_("photo_id", image_ids)\
            .execute()
        
        has_descriptors = any(
            face.get("insightface_descriptor") is not None and face.get("insightface_descriptor") != ""
            for face in (descriptors_result.data or [])
        )
        
        logger.info(f"[Images API] Gallery has descriptors: {has_descriptors}")
        
        # 3. Удаляем все фото из БД (CASCADE удалит связанные данные)
        deleted_count = 0
        failed_count = 0
        
        for image in images:
            try:
                supabase_db.client.table("gallery_images")\
                    .delete()\
                    .eq("id", image["id"])\
                    .execute()
                deleted_count += 1
                
                # Удаляем blob файл
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
                    except Exception as e:
                        logger.warning(f"[Images API] Warning: Failed to delete blob {image_url}: {e}")
                        
            except Exception as e:
                logger.error(f"[Images API] Failed to delete image {image['id']}: {e}")
                failed_count += 1
        
        logger.info(f"[Images API] Deleted {deleted_count} images, {failed_count} failed")
        
        # 4. Перестраиваем индекс если были дескрипторы
        index_rebuilt = False
        if has_descriptors and deleted_count > 0:
            try:
                pre_count = len(face_service.player_ids_map) if face_service.player_ids_map else 0
                logger.info(f"[Images API] Rebuilding index (current size: {pre_count})...")
                
                rebuild_result = await face_service.rebuild_players_index()
                
                if rebuild_result.get("success"):
                    post_count = rebuild_result.get('new_descriptor_count', 0)
                    logger.info(f"[Images API] ✓ Index rebuilt: {pre_count} -> {post_count} descriptors")
                    index_rebuilt = True
                else:
                    logger.error(f"[Images API] Index rebuild failed: {rebuild_result.get('error')}")
            except Exception as e:
                logger.error(f"[Images API] Warning: Failed to rebuild index: {e}", exc_info=True)
        
        logger.info("[Images API] ===== DELETE ALL REQUEST COMPLETE =====")
        logger.info("=" * 80)
        
        return BatchDeleteResponse(
            success=failed_count == 0,
            deleted_count=deleted_count,
            failed_count=failed_count,
            had_descriptors=has_descriptors,
            index_rebuilt=index_rebuilt,
            message=f"Deleted {deleted_count} images" + (f", {failed_count} failed" if failed_count > 0 else "")
        )
        
    except Exception as e:
        logger.error(f"[Images API] Error in batch delete: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-add", response_model=BatchAddImagesResponse)
async def batch_add_images(request: BatchAddImagesRequest):
    """
    Добавляет несколько фото в галерею одновременно.
    """
    try:
        logger.info(f"[Images API] Adding {len(request.images)} images to gallery {request.galleryId}")
        
        # Получаем максимальный display_order для галереи
        max_order_result = supabase_db.client.table("gallery_images")\
            .select("display_order")\
            .eq("gallery_id", request.galleryId)\
            .order("display_order", desc=True)\
            .limit(1)\
            .execute()
        
        start_order = max_order_result.data[0]["display_order"] + 1 if max_order_result.data else 0
        
        # Формируем данные для вставки
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
        
        # Вставляем в БД
        result = supabase_db.client.table("gallery_images").insert(images_to_insert).execute()
        
        inserted_count = len(result.data) if result.data else 0
        logger.info(f"[Images API] Successfully inserted {inserted_count} images")
        
        return BatchAddImagesResponse(
            success=True,
            inserted_count=inserted_count,
            message=f"Successfully added {inserted_count} images"
        )
        
    except Exception as e:
        logger.error(f"[Images API] Error in batch add: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{image_id}/mark-processed", response_model=MarkProcessedResponse)
async def mark_image_as_processed(image_id: str):
    """
    Помечает фото как обработанное (has_been_processed = true).
    """
    try:
        logger.info(f"[Images API] Marking image {image_id} as processed")
        
        result = supabase_db.client.table("gallery_images")\
            .update({"has_been_processed": True})\
            .eq("id", image_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Image not found")
        
        logger.info(f"[Images API] Image {image_id} marked as processed")
        
        return MarkProcessedResponse(
            success=True,
            message="Image marked as processed"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Images API] Error marking image as processed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
