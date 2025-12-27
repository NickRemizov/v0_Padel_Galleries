"""
Galleries API Router
CRUD operations for galleries
Supports both UUID and slug identifiers for human-readable URLs

v1.1: Migrated to SupabaseService (removed SupabaseDatabase)
v1.3: Removed per-endpoint auth (moved to middleware)
v1.4: Fixed stats - requires has_been_processed=true for verified status
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional, List

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from core.slug import resolve_identifier, is_uuid
from services.supabase import SupabaseService
from services.face_recognition import FaceRecognitionService

logger = get_logger(__name__)
router = APIRouter()

supabase_db_instance: SupabaseService = None
face_service_instance: FaceRecognitionService = None


def set_services(supabase_db: SupabaseService, face_service: FaceRecognitionService = None):
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service


def _resolve_gallery(identifier: str, select: str = "*") -> Optional[dict]:
    """Resolve gallery by ID or slug."""
    return resolve_identifier(
        supabase_db_instance.client,
        "galleries",
        identifier,
        slug_column="slug",
        select=select
    )


def _get_gallery_id(identifier: str) -> str:
    """Get gallery ID from identifier (ID or slug). Raises NotFoundError if not found."""
    gallery = _resolve_gallery(identifier)
    if not gallery:
        raise NotFoundError("Gallery", identifier)
    return gallery["id"]


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


class BatchDeleteImagesRequest(BaseModel):
    image_ids: List[str]
    gallery_id: str


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


@router.get("/with-unprocessed-photos")
async def get_galleries_with_unprocessed_photos():
    """Get galleries that have unprocessed photos (has_been_processed = false or null)."""
    try:
        galleries_result = supabase_db_instance.client.table("galleries").select(
            "id, title, shoot_date, slug"
        ).order("shoot_date", desc=True).execute()
        
        galleries = galleries_result.data or []
        if not galleries:
            return ApiResponse.ok([])
        
        result = []
        for gallery in galleries:
            total_result = supabase_db_instance.client.table("gallery_images").select(
                "id", count="exact"
            ).eq("gallery_id", gallery["id"]).execute()
            total_count = total_result.count or 0
            
            unprocessed_result = supabase_db_instance.client.table("gallery_images").select(
                "id", count="exact"
            ).eq("gallery_id", gallery["id"]).or_(
                "has_been_processed.is.null,has_been_processed.eq.false"
            ).execute()
            unprocessed_count = unprocessed_result.count or 0
            
            if unprocessed_count > 0:
                result.append({
                    "id": gallery["id"],
                    "slug": gallery.get("slug"),
                    "title": gallery["title"],
                    "shoot_date": gallery["shoot_date"],
                    "total_photos": total_count,
                    "unprocessed_photos": unprocessed_count
                })
        
        logger.info(f"Found {len(result)} galleries with unprocessed photos")
        return ApiResponse.ok(result)
    except Exception as e:
        logger.error(f"Error getting galleries with unprocessed photos: {e}")
        raise DatabaseError(str(e), operation="get_galleries_with_unprocessed_photos")


@router.get("/with-unverified-faces")
async def get_galleries_with_unverified_faces():
    """Get galleries that have photos NOT fully verified."""
    try:
        galleries_result = supabase_db_instance.client.table("galleries").select(
            "id, title, shoot_date, slug"
        ).order("shoot_date", desc=True).execute()
        
        galleries = galleries_result.data or []
        if not galleries:
            return ApiResponse.ok([])
        
        result = []
        for gallery in galleries:
            photos_result = supabase_db_instance.client.table("gallery_images").select(
                "id"
            ).eq("gallery_id", gallery["id"]).execute()
            
            photos = photos_result.data or []
            if not photos:
                continue
            
            total_count = len(photos)
            photo_ids = [p["id"] for p in photos]
            
            all_faces_result = supabase_db_instance.client.table("photo_faces").select(
                "photo_id, recognition_confidence"
            ).in_("photo_id", photo_ids).execute()
            
            all_faces = all_faces_result.data or []
            
            faces_by_photo = {}
            for face in all_faces:
                pid = face["photo_id"]
                if pid not in faces_by_photo:
                    faces_by_photo[pid] = []
                faces_by_photo[pid].append(face)
            
            fully_verified_photo_ids = set()
            for photo_id, faces in faces_by_photo.items():
                if len(faces) > 0 and all(f.get("recognition_confidence") == 1 for f in faces):
                    fully_verified_photo_ids.add(photo_id)
            
            unverified_count = total_count - len(fully_verified_photo_ids)
            
            if unverified_count > 0:
                result.append({
                    "id": gallery["id"],
                    "slug": gallery.get("slug"),
                    "title": gallery["title"],
                    "shoot_date": gallery["shoot_date"],
                    "total_photos": total_count,
                    "unverified_photos": unverified_count
                })
        
        logger.info(f"Found {len(result)} galleries with unverified faces")
        return ApiResponse.ok(result)
    except Exception as e:
        logger.error(f"Error getting galleries with unverified faces: {e}")
        raise DatabaseError(str(e), operation="get_galleries_with_unverified_faces")


@router.get("/with-unrecognized-faces")
async def get_galleries_with_unrecognized_faces():
    """Alias for with-unverified-faces (backward compatibility)."""
    return await get_galleries_with_unverified_faces()


@router.get("/{identifier}")
async def get_gallery(identifier: str):
    """Get a gallery by ID or slug."""
    try:
        gallery = _resolve_gallery(
            identifier,
            select="*, photographers(id, name), locations(id, name), organizers(id, name)"
        )
        
        if gallery:
            count_result = supabase_db_instance.client.table("gallery_images").select(
                "id", count="exact"
            ).eq("gallery_id", gallery["id"]).execute()
            gallery["photo_count"] = count_result.count or 0
            
            return ApiResponse.ok(gallery)
        raise NotFoundError("Gallery", identifier)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_gallery")


@router.get("/{identifier}/unprocessed-photos")
async def get_gallery_unprocessed_photos(identifier: str):
    """Get unprocessed photos from a gallery for recognition."""
    try:
        gallery_id = _get_gallery_id(identifier)
        
        result = supabase_db_instance.client.table("gallery_images").select(
            "id, image_url, original_filename, slug"
        ).eq("gallery_id", gallery_id).or_(
            "has_been_processed.is.null,has_been_processed.eq.false"
        ).order("original_filename").execute()
        
        images = result.data or []
        logger.info(f"Found {len(images)} unprocessed photos in gallery {gallery_id}")
        return ApiResponse.ok(images)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting unprocessed photos for gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_gallery_unprocessed_photos")


@router.get("/{identifier}/unverified-photos")
async def get_gallery_unverified_photos(identifier: str):
    """Get photos from a gallery that are NOT fully verified."""
    try:
        gallery_id = _get_gallery_id(identifier)
        
        photos_result = supabase_db_instance.client.table("gallery_images").select(
            "id, image_url, original_filename, slug"
        ).eq("gallery_id", gallery_id).order("original_filename").execute()
        
        photos = photos_result.data or []
        if not photos:
            return ApiResponse.ok([])
        
        photo_ids = [p["id"] for p in photos]
        
        all_faces_result = supabase_db_instance.client.table("photo_faces").select(
            "photo_id, recognition_confidence"
        ).in_("photo_id", photo_ids).execute()
        
        all_faces = all_faces_result.data or []
        
        faces_by_photo = {}
        for face in all_faces:
            pid = face["photo_id"]
            if pid not in faces_by_photo:
                faces_by_photo[pid] = []
            faces_by_photo[pid].append(face)
        
        fully_verified_photo_ids = set()
        for photo_id, faces in faces_by_photo.items():
            if len(faces) > 0 and all(f.get("recognition_confidence") == 1 for f in faces):
                fully_verified_photo_ids.add(photo_id)
        
        result = [p for p in photos if p["id"] not in fully_verified_photo_ids]
        
        logger.info(f"Found {len(result)} unverified photos in gallery {gallery_id}")
        return ApiResponse.ok(result)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting unverified photos for gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_gallery_unverified_photos")


@router.get("/{identifier}/unrecognized-photos")
async def get_gallery_unrecognized_photos(identifier: str):
    """Alias for unverified-photos (backward compatibility)."""
    return await get_gallery_unverified_photos(identifier)


@router.get("/{identifier}/stats")
async def get_gallery_stats(identifier: str):
    """Get face recognition stats for a gallery.
    
    v1.4: Fixed logic - requires has_been_processed=true for verified status.
    Photo is verified only if:
    - has_been_processed=true AND no faces detected, OR
    - has_been_processed=true AND all faces have verified=true
    """
    try:
        gallery_id = _get_gallery_id(identifier)
        
        # Fetch images with has_been_processed status
        images_result = supabase_db_instance.client.table("gallery_images").select(
            "id, has_been_processed"
        ).eq("gallery_id", gallery_id).execute()
        images = images_result.data or []
        
        if not images:
            return ApiResponse.ok({
                "isFullyVerified": True,
                "verifiedCount": 0,
                "totalCount": 0
            })
        
        image_ids = [img["id"] for img in images]
        processed_status = {img["id"]: img.get("has_been_processed", False) for img in images}
        
        faces_result = supabase_db_instance.client.table("photo_faces").select(
            "photo_id, verified"
        ).in_("photo_id", image_ids).execute()
        
        all_faces = faces_result.data or []
        
        faces_by_photo = {}
        for face in all_faces:
            pid = face["photo_id"]
            if pid not in faces_by_photo:
                faces_by_photo[pid] = []
            faces_by_photo[pid].append(face)
        
        verified_count = 0
        for photo_id in image_ids:
            # Photo must be processed first
            if not processed_status.get(photo_id):
                continue  # Not processed = not verified
            
            faces = faces_by_photo.get(photo_id, [])
            if len(faces) == 0:
                # Processed, no faces = verified (OK state)
                verified_count += 1
            elif all(f.get("verified", False) for f in faces):
                # Processed, all faces verified = verified
                verified_count += 1
        
        total_count = len(image_ids)
        is_fully_verified = verified_count == total_count and total_count > 0
        
        return ApiResponse.ok({
            "isFullyVerified": is_fully_verified,
            "verifiedCount": verified_count,
            "totalCount": total_count
        })
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting gallery stats {identifier}: {e}")
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


@router.put("/{identifier}")
async def update_gallery(identifier: str, data: GalleryUpdate):
    """Update a gallery by ID or slug."""
    try:
        gallery_id = _get_gallery_id(identifier)
        
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        
        result = supabase_db_instance.client.table("galleries").update(update_data).eq("id", gallery_id).execute()
        if result.data:
            logger.info(f"Updated gallery {gallery_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Gallery", identifier)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="update_gallery")


@router.patch("/{identifier}/sort-order")
async def update_sort_order(identifier: str, sort_order: str = Query(...)):
    """Update gallery sort order."""
    try:
        gallery_id = _get_gallery_id(identifier)
        
        supabase_db_instance.client.table("galleries").update({"sort_order": sort_order}).eq("id", gallery_id).execute()
        logger.info(f"Updated sort order for gallery {gallery_id}")
        return ApiResponse.ok({"updated": True})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating sort order: {e}")
        raise DatabaseError(str(e), operation="update_sort_order")


@router.post("/batch-delete-images")
async def batch_delete_gallery_images(data: BatchDeleteImagesRequest):
    """Batch delete multiple images from a gallery."""
    try:
        image_ids = data.image_ids
        gallery_id = data.gallery_id
        
        if not image_ids:
            return ApiResponse.ok({
                "deleted_count": 0,
                "had_verified_faces": False,
                "index_rebuilt": False
            })
        
        logger.info(f"Batch deleting {len(image_ids)} images from gallery {gallery_id}")
        
        verified_check = supabase_db_instance.client.table("photo_faces").select(
            "id", count="exact"
        ).in_("photo_id", image_ids).eq("verified", True).execute()
        
        had_verified_faces = (verified_check.count or 0) > 0
        
        supabase_db_instance.client.table("photo_faces").delete().in_("photo_id", image_ids).execute()
        
        delete_result = supabase_db_instance.client.table("gallery_images").delete().in_(
            "id", image_ids
        ).eq("gallery_id", gallery_id).execute()
        
        deleted_count = len(delete_result.data) if delete_result.data else 0
        logger.info(f"Deleted {deleted_count} images from gallery {gallery_id}")
        
        index_rebuilt = False
        if had_verified_faces and face_service_instance:
            try:
                await face_service_instance.rebuild_players_index()
                index_rebuilt = True
                logger.info("Rebuilt players index after batch delete")
            except Exception as e:
                logger.error(f"Failed to rebuild index after batch delete: {e}")
        
        return ApiResponse.ok({
            "deleted_count": deleted_count,
            "had_verified_faces": had_verified_faces,
            "index_rebuilt": index_rebuilt
        })
    except Exception as e:
        logger.error(f"Error batch deleting images: {e}")
        raise DatabaseError(str(e), operation="batch_delete_gallery_images")


@router.delete("/{identifier}")
async def delete_gallery(identifier: str, delete_images: bool = Query(True)):
    """Delete a gallery and optionally all its images."""
    try:
        gallery_id = _get_gallery_id(identifier)
        
        if delete_images:
            images = supabase_db_instance.client.table("gallery_images").select("id").eq("gallery_id", gallery_id).execute()
            image_ids = [img["id"] for img in (images.data or [])]
            
            if image_ids:
                supabase_db_instance.client.table("photo_faces").delete().in_("photo_id", image_ids).execute()
                supabase_db_instance.client.table("gallery_images").delete().eq("gallery_id", gallery_id).execute()
                logger.info(f"Deleted {len(image_ids)} images from gallery {gallery_id}")
        
        supabase_db_instance.client.table("galleries").delete().eq("id", gallery_id).execute()
        logger.info(f"Deleted gallery {gallery_id}")
        
        index_rebuilt = False
        if face_service_instance:
            try:
                await face_service_instance.rebuild_players_index()
                index_rebuilt = True
                logger.info(f"Rebuilt players index after deleting gallery {gallery_id}")
            except Exception as e:
                logger.error(f"Failed to rebuild index after gallery deletion: {e}")
        
        return ApiResponse.ok({"deleted": True, "index_rebuilt": index_rebuilt})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="delete_gallery")
