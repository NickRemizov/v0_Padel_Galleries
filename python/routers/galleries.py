"""
Galleries API Router
CRUD operations for galleries
Supports both UUID and slug identifiers for human-readable URLs
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional, List

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from core.slug import resolve_identifier, is_uuid
from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService

logger = get_logger(__name__)
router = APIRouter()

supabase_db_instance: SupabaseDatabase = None
face_service_instance: FaceRecognitionService = None


def set_services(supabase_db: SupabaseDatabase, face_service: FaceRecognitionService = None):
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
        # Get all galleries
        galleries_result = supabase_db_instance.client.table("galleries").select(
            "id, title, shoot_date, slug"
        ).order("shoot_date", desc=True).execute()
        
        galleries = galleries_result.data or []
        if not galleries:
            return ApiResponse.ok([])
        
        result = []
        for gallery in galleries:
            # Total photos count
            total_result = supabase_db_instance.client.table("gallery_images").select(
                "id", count="exact"
            ).eq("gallery_id", gallery["id"]).execute()
            total_count = total_result.count or 0
            
            # Unprocessed photos count (has_been_processed = false or null)
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
    """
    Get galleries that have photos NOT fully verified.
    A photo is fully verified ONLY if ALL its faces have recognition_confidence = 1.
    Photos with no faces or with any face having confidence != 1 are unverified.
    """
    try:
        # Get all galleries
        galleries_result = supabase_db_instance.client.table("galleries").select(
            "id, title, shoot_date, slug"
        ).order("shoot_date", desc=True).execute()
        
        galleries = galleries_result.data or []
        if not galleries:
            return ApiResponse.ok([])
        
        result = []
        for gallery in galleries:
            # Get all photos in gallery
            photos_result = supabase_db_instance.client.table("gallery_images").select(
                "id"
            ).eq("gallery_id", gallery["id"]).execute()
            
            photos = photos_result.data or []
            if not photos:
                continue
            
            total_count = len(photos)
            photo_ids = [p["id"] for p in photos]
            
            # Get ALL faces for these photos
            all_faces_result = supabase_db_instance.client.table("photo_faces").select(
                "photo_id, recognition_confidence"
            ).in_("photo_id", photo_ids).execute()
            
            all_faces = all_faces_result.data or []
            
            # Build map: photo_id -> list of faces
            faces_by_photo = {}
            for face in all_faces:
                pid = face["photo_id"]
                if pid not in faces_by_photo:
                    faces_by_photo[pid] = []
                faces_by_photo[pid].append(face)
            
            # Find fully verified photos (ALL faces have confidence = 1)
            fully_verified_photo_ids = set()
            for photo_id, faces in faces_by_photo.items():
                # Photo is fully verified only if it has faces AND all have confidence = 1
                if len(faces) > 0 and all(f.get("recognition_confidence") == 1 for f in faces):
                    fully_verified_photo_ids.add(photo_id)
            
            # Unverified = all photos - fully verified
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


# Keep old endpoint for backward compatibility
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
            # Add photo count
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
    """
    Get photos from a gallery that are NOT fully verified.
    A photo is fully verified ONLY if ALL its faces have recognition_confidence = 1.
    """
    try:
        gallery_id = _get_gallery_id(identifier)
        
        # Get all photos in gallery
        photos_result = supabase_db_instance.client.table("gallery_images").select(
            "id, image_url, original_filename, slug"
        ).eq("gallery_id", gallery_id).order("original_filename").execute()
        
        photos = photos_result.data or []
        if not photos:
            return ApiResponse.ok([])
        
        photo_ids = [p["id"] for p in photos]
        
        # Get ALL faces for these photos
        all_faces_result = supabase_db_instance.client.table("photo_faces").select(
            "photo_id, recognition_confidence"
        ).in_("photo_id", photo_ids).execute()
        
        all_faces = all_faces_result.data or []
        
        # Build map: photo_id -> list of faces
        faces_by_photo = {}
        for face in all_faces:
            pid = face["photo_id"]
            if pid not in faces_by_photo:
                faces_by_photo[pid] = []
            faces_by_photo[pid].append(face)
        
        # Find fully verified photos (ALL faces have confidence = 1)
        fully_verified_photo_ids = set()
        for photo_id, faces in faces_by_photo.items():
            if len(faces) > 0 and all(f.get("recognition_confidence") == 1 for f in faces):
                fully_verified_photo_ids.add(photo_id)
        
        # Return photos that are NOT fully verified
        result = [p for p in photos if p["id"] not in fully_verified_photo_ids]
        
        logger.info(f"Found {len(result)} unverified photos in gallery {gallery_id}")
        return ApiResponse.ok(result)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting unverified photos for gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_gallery_unverified_photos")


# Keep old endpoint for backward compatibility
@router.get("/{identifier}/unrecognized-photos")
async def get_gallery_unrecognized_photos(identifier: str):
    """Alias for unverified-photos (backward compatibility)."""
    return await get_gallery_unverified_photos(identifier)


@router.get("/{identifier}/stats")
async def get_gallery_stats(identifier: str):
    """Get face recognition stats for a gallery."""
    try:
        gallery_id = _get_gallery_id(identifier)
        
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


@router.delete("/batch-delete-images")
async def batch_delete_gallery_images(data: BatchDeleteImagesRequest):
    """
    Batch delete multiple images from a gallery.
    Performance: O(1) instead of O(n) - single query per operation, single index rebuild.
    """
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
        
        # Step 1: Check if ANY images have verified faces (single query)
        verified_check = supabase_db_instance.client.table("photo_faces").select(
            "id", count="exact"
        ).in_("photo_id", image_ids).eq("verified", True).execute()
        
        had_verified_faces = (verified_check.count or 0) > 0
        
        # Step 2: Delete all photo_faces for these images (single query)
        supabase_db_instance.client.table("photo_faces").delete().in_("photo_id", image_ids).execute()
        
        # Step 3: Delete all face_descriptors for these images (single query)
        supabase_db_instance.client.table("face_descriptors").delete().in_("source_image_id", image_ids).execute()
        
        # Step 4: Delete all images (single query)
        delete_result = supabase_db_instance.client.table("gallery_images").delete().in_(
            "id", image_ids
        ).eq("gallery_id", gallery_id).execute()
        
        deleted_count = len(delete_result.data) if delete_result.data else 0
        logger.info(f"Deleted {deleted_count} images from gallery {gallery_id}")
        
        # Step 5: Rebuild index ONCE if any verified faces existed
        index_rebuilt = False
        if had_verified_faces and face_service_instance:
            try:
                await face_service_instance.rebuild_players_index()
                index_rebuilt = True
                logger.info(f"Rebuilt players index after batch delete")
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
        
        # Rebuild face recognition index to remove stale embeddings
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
