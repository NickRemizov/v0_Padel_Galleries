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
from core.slug import generate_photo_slug, make_unique_slug
from infrastructure.minio_storage import get_minio_storage

from .models import BatchAddImagesRequest, UpdateFeaturedRequest
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

        # Get existing slugs in this gallery for uniqueness
        existing_result = supabase_db.client.table("gallery_images").select("slug").eq("gallery_id", request.galleryId).execute()
        existing_slugs = {img["slug"] for img in (existing_result.data or []) if img.get("slug")}

        images_to_insert = []
        for idx, img in enumerate(request.images):
            # Generate unique slug within gallery
            base_slug = generate_photo_slug(img.originalFilename or "")
            if not base_slug:
                base_slug = "photo"
            slug = make_unique_slug(base_slug, existing_slugs)
            existing_slugs.add(slug)

            images_to_insert.append({
                "gallery_id": request.galleryId,
                "image_url": img.imageUrl,
                "original_url": img.originalUrl,
                "original_filename": img.originalFilename,
                "width": img.width,
                "height": img.height,
                "file_size": img.fileSize,
                "display_order": start_order + idx,
                "slug": slug
            })

        result = supabase_db.client.table("gallery_images").insert(images_to_insert).execute()

        inserted_count = len(result.data) if result.data else 0
        logger.info(f"Successfully inserted {inserted_count} images with slugs")

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
        
        # Get faces with descriptors and person_id (those are in index)
        faces_result = supabase_db.client.table("photo_faces").select(
            "id, insightface_descriptor, person_id"
        ).eq("photo_id", image_id).execute()

        face_ids_in_index = [
            f["id"] for f in (faces_result.data or [])
            if f.get("insightface_descriptor") and f.get("person_id")
        ]
        has_descriptors = len(face_ids_in_index) > 0

        # Delete from DB (CASCADE deletes photo_faces)
        supabase_db.client.table("gallery_images").delete().eq("id", image_id).execute()

        logger.info("Image deleted from DB")

        # Delete storage file (MinIO or Vercel Blob)
        if image_url:
            try:
                minio_public_url = os.getenv("MINIO_PUBLIC_URL", "")
                if minio_public_url and minio_public_url in image_url:
                    # Delete from MinIO
                    minio = get_minio_storage()
                    minio.delete_file(image_url)
                    logger.info("MinIO file deleted")
                else:
                    # Delete from Vercel Blob (legacy)
                    blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
                    if blob_token and image_url.startswith("https://"):
                        async with httpx.AsyncClient() as client:
                            delete_response = await client.delete(
                                image_url,
                                headers={"Authorization": f"Bearer {blob_token}"}
                            )
                            if delete_response.status_code in [200, 204]:
                                logger.info("Vercel Blob file deleted")
            except Exception as e:
                logger.warning(f"Failed to delete storage file: {e}")

        # Remove faces from index
        index_rebuilt = False
        if face_ids_in_index:
            try:
                result = await face_service.remove_faces_from_index(face_ids_in_index)
                index_rebuilt = result.get("deleted", 0) > 0
                logger.info(f"Removed {result.get('deleted', 0)} faces from index")
            except Exception as e:
                logger.error(f"Failed to update index: {e}")
        
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


@router.patch("/{image_id}/featured")
async def update_image_featured(image_id: str, request: UpdateFeaturedRequest):
    """Update is_featured flag for an image."""
    supabase_db = get_supabase_db()

    try:
        result = supabase_db.client.table("gallery_images").update({
            "is_featured": request.is_featured
        }).eq("id", image_id).execute()

        if not result.data:
            raise NotFoundError("Image", image_id)

        logger.info(f"Updated featured status for image {image_id}: {request.is_featured}")
        return ApiResponse.ok(result.data[0])

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating featured status: {e}")
        raise DatabaseError(str(e), operation="update_featured")
