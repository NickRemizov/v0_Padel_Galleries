"""
People API - Photo Operations
Endpoints for person's photos: list, verify, unlink

v2.0: Added batch-verify-on-photos endpoint for bulk verification
v2.1: Added index rebuild after unlink to invalidate FAISS cache
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List
from uuid import UUID

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger

from .helpers import get_supabase_db, convert_bbox_to_array, get_face_service, get_person_id

logger = get_logger(__name__)
router = APIRouter()


class BatchVerifyRequest(BaseModel):
    """Request body for batch verification."""
    photo_ids: List[str]


def _get_person_id_from_uuid(supabase_db, person_uuid: UUID) -> str:
    """Get person ID from UUID. Raises NotFoundError if not found."""
    result = supabase_db.client.table("people").select("id").eq("id", str(person_uuid)).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]["id"]
    raise NotFoundError("Person", str(person_uuid))


def _get_person_id_from_identifier(identifier: str) -> str:
    """Get person ID from UUID or slug. Raises NotFoundError if not found."""
    return get_person_id(identifier)


@router.get("/{identifier}/photos")
async def get_person_photos(identifier: str):
    """Get all photos containing this person with gallery info for sorting.

    Accepts UUID or slug as identifier.
    """
    supabase_db = get_supabase_db()

    try:
        person_id = _get_person_id_from_identifier(identifier)

        config = supabase_db.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)

        # Include galleries join for title, shoot_date, sort_order
        # Added: original_url, file_size, width, height for lightbox display
        # Added: slug for SEO-friendly URLs
        result = supabase_db.client.table("photo_faces").select(
            "id, photo_id, verified, recognition_confidence, "
            "gallery_images!inner(id, slug, image_url, original_url, original_filename, file_size, width, height, gallery_id, created_at, "
            "galleries(id, slug, title, shoot_date, sort_order))"
        ).eq("person_id", person_id).or_(f"verified.eq.true,recognition_confidence.gte.{confidence_threshold}").execute()
        return ApiResponse.ok(result.data or [])
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting person photos: {e}")
        raise DatabaseError(str(e), operation="get_person_photos")


@router.get("/{identifier:uuid}/photos-with-details")
async def get_person_photos_with_details(identifier: UUID):
    """Получает фотографии человека с детальной информацией, включая excluded_from_index."""
    supabase_db = get_supabase_db()
    
    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)
        
        logger.info(f"Getting photos with details for person {person_id}")
        
        config = supabase_db.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Получаем все photo_faces для этого человека (включая excluded_from_index)
        photo_faces_result = supabase_db.client.table("photo_faces")\
            .select(
                "id, photo_id, recognition_confidence, verified, insightface_bbox, person_id, excluded_from_index, "
                "gallery_images(id, image_url, gallery_id, width, height, original_filename, galleries(shoot_date, title))"
            )\
            .eq("person_id", person_id)\
            .execute()
        
        all_photo_faces = photo_faces_result.data or []
        
        # Фильтруем по verified или confidence
        photo_faces = [
            pf for pf in all_photo_faces
            if pf.get("verified") == True or (pf.get("recognition_confidence") or 0) >= confidence_threshold
        ]
        
        logger.info(f"Found {len(all_photo_faces)} total, {len(photo_faces)} after filtering")
        
        # Собираем уникальные фото
        photos_map = {}
        for pf in photo_faces:
            gi = pf.get("gallery_images")
            if not gi:
                continue
            
            photo_id = gi["id"]
            if photo_id not in photos_map:
                faces_for_photo = [f for f in photo_faces if f.get("gallery_images", {}).get("id") == photo_id]
                is_verified = any(f.get("verified") == True for f in faces_for_photo)
                is_excluded = any(f.get("excluded_from_index") == True for f in faces_for_photo)
                
                photos_map[photo_id] = {
                    **gi,
                    "faceId": pf["id"],
                    "confidence": pf.get("recognition_confidence"),
                    "verified": is_verified,
                    "excluded_from_index": is_excluded,
                    "boundingBox": pf.get("insightface_bbox"),
                    "shootDate": gi.get("galleries", {}).get("shoot_date") if gi.get("galleries") else None,
                    "filename": gi.get("original_filename", ""),
                    "gallery_name": gi.get("galleries", {}).get("title") if gi.get("galleries") else None,
                }
        
        photos = list(photos_map.values())
        photo_ids = [p["id"] for p in photos]
        
        if not photo_ids:
            return ApiResponse.ok([])
        
        # Получаем все лица для этих фото
        all_faces_result = supabase_db.client.table("photo_faces")\
            .select("id, photo_id, person_id, verified, recognition_confidence, people(real_name, telegram_name)")\
            .in_("photo_id", photo_ids)\
            .or_(f"verified.eq.true,recognition_confidence.gte.{confidence_threshold}")\
            .execute()
        
        all_faces = all_faces_result.data or []
        
        # Собираем "другие лица" для каждого фото
        other_faces_by_photo = {}
        for face in all_faces:
            if face.get("person_id") == person_id:
                continue
            
            photo_id = face.get("photo_id")
            if photo_id not in other_faces_by_photo:
                other_faces_by_photo[photo_id] = []
            
            people_data = face.get("people") or {}
            other_faces_by_photo[photo_id].append({
                "personName": people_data.get("real_name") or people_data.get("telegram_name") or "Unknown",
                "verified": face.get("verified"),
                "confidence": face.get("recognition_confidence")
            })
        
        photos_with_other_faces = [
            {**photo, "otherFaces": other_faces_by_photo.get(photo["id"], [])}
            for photo in photos
        ]
        
        logger.info(f"Returning {len(photos_with_other_faces)} photos with details")
        return ApiResponse.ok(photos_with_other_faces)
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting photos with details: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="get_person_photos_with_details")


@router.post("/{identifier:uuid}/verify-on-photo")
async def verify_person_on_photo(identifier: UUID, photo_id: str = Query(...)):
    """Верифицирует человека на конкретном фото."""
    supabase_db = get_supabase_db()
    
    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)
        
        logger.info(f"Verifying person {person_id} on photo {photo_id}")
        
        result = supabase_db.client.table("photo_faces")\
            .update({"verified": True, "recognition_confidence": 1.0})\
            .eq("photo_id", photo_id)\
            .eq("person_id", person_id)\
            .execute()
        
        if result.data:
            logger.info(f"Person verified on photo successfully")
            return ApiResponse.ok({"verified": True})
        raise NotFoundError("Face", f"{identifier} on photo {photo_id}")
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error verifying person on photo: {e}")
        raise DatabaseError(str(e), operation="verify_person_on_photo")


@router.post("/{identifier:uuid}/batch-verify-on-photos")
async def batch_verify_person_on_photos(identifier: UUID, request: BatchVerifyRequest):
    """
    Batch verify person on multiple photos in a single DB operation.
    
    v2.0: New endpoint for efficient bulk verification.
    Much faster than calling verify-on-photo N times.
    
    Args:
        identifier: Person UUID
        request: BatchVerifyRequest with photo_ids list
        
    Returns:
        {verified_count: int} - number of faces verified
    """
    supabase_db = get_supabase_db()
    
    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)
        photo_ids = request.photo_ids
        
        if not photo_ids:
            return ApiResponse.ok({"verified_count": 0})
        
        logger.info(f"Batch verifying person {person_id} on {len(photo_ids)} photos")
        
        # Single UPDATE with IN clause - O(1) instead of O(n)
        result = supabase_db.client.table("photo_faces")\
            .update({"verified": True, "recognition_confidence": 1.0})\
            .in_("photo_id", photo_ids)\
            .eq("person_id", person_id)\
            .execute()
        
        verified_count = len(result.data) if result.data else 0
        logger.info(f"Batch verified {verified_count} faces")
        
        return ApiResponse.ok({"verified_count": verified_count})
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error batch verifying person on photos: {e}")
        raise DatabaseError(str(e), operation="batch_verify_person_on_photos")


@router.post("/{identifier:uuid}/unlink-from-photo")
async def unlink_person_from_photo(identifier: UUID, photo_id: str = Query(...)):
    """
    Отвязывает человека от фото.
    
    v2.1: После unlink перестраивает HNSW индекс чтобы убрать
    дескриптор из памяти и предотвратить ложное распознавание.
    """
    supabase_db = get_supabase_db()
    
    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)
        
        logger.info(f"Unlinking person {person_id} from photo {photo_id}")

        # Get face_ids with descriptors before unlinking (for index removal)
        faces_result = supabase_db.client.table("photo_faces")\
            .select("id, insightface_descriptor")\
            .eq("photo_id", photo_id)\
            .eq("person_id", person_id)\
            .execute()

        faces_data = faces_result.data or []
        face_ids_in_index = [f["id"] for f in faces_data if f.get("insightface_descriptor")]
        faces_count = len(faces_data)
        logger.info(f"Found {faces_count} faces to unlink, {len(face_ids_in_index)} in index")

        # Then update
        supabase_db.client.table("photo_faces")\
            .update({
                "person_id": None,
                "verified": False,
                "verified_at": None,
                "verified_by": None,
                "recognition_confidence": None
            })\
            .eq("photo_id", photo_id)\
            .eq("person_id", person_id)\
            .execute()

        logger.info(f"Unlinked {faces_count} faces")

        # Remove from index
        if face_ids_in_index:
            face_service = get_face_service()
            result = await face_service.remove_faces_from_index(face_ids_in_index)
            logger.info(f"Removed {result.get('deleted', 0)} faces from index")
        
        return ApiResponse.ok({"unlinked_count": faces_count})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error unlinking person from photo: {e}")
        raise DatabaseError(str(e), operation="unlink_person_from_photo")
