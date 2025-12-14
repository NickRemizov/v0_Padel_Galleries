"""
People API Router
CRUD and advanced operations for people (players)
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional, List

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService

logger = get_logger(__name__)
router = APIRouter()

supabase_db_instance: SupabaseDatabase = None
face_service_instance: FaceRecognitionService = None


def set_services(supabase_db: SupabaseDatabase, face_service: FaceRecognitionService):
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service


class PersonCreate(BaseModel):
    real_name: str
    telegram_name: Optional[str] = None
    telegram_nickname: Optional[str] = None
    telegram_profile_url: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[int] = None
    avatar_url: Optional[str] = None
    show_in_players_gallery: bool = True
    show_photos_in_galleries: bool = True


class PersonUpdate(BaseModel):
    real_name: Optional[str] = None
    telegram_name: Optional[str] = None
    telegram_nickname: Optional[str] = None
    telegram_profile_url: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[int] = None
    avatar_url: Optional[str] = None
    show_in_players_gallery: Optional[bool] = None
    show_photos_in_galleries: Optional[bool] = None


class VisibilityUpdate(BaseModel):
    show_in_players_gallery: Optional[bool] = None
    show_photos_in_galleries: Optional[bool] = None


@router.get("")
async def get_people(with_stats: bool = Query(False)):
    """Get all people, optionally with face stats."""
    try:
        result = supabase_db_instance.client.table("people").select("*").order("real_name").execute()
        people = result.data or []
        
        if not with_stats:
            return ApiResponse.ok(people)
        
        people_with_stats = await _calculate_people_stats(people)
        return ApiResponse.ok(people_with_stats)
    except Exception as e:
        logger.error(f"Error getting people: {e}")
        raise DatabaseError(str(e), operation="get_people")


@router.get("/{person_id}")
async def get_person(person_id: str):
    """Get a person by ID."""
    try:
        result = supabase_db_instance.client.table("people").select("*").eq("id", person_id).execute()
        if result.data and len(result.data) > 0:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", person_id)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting person {person_id}: {e}")
        raise DatabaseError(str(e), operation="get_person")


@router.get("/{person_id}/photos")
async def get_person_photos(person_id: str):
    """Get all photos containing this person."""
    try:
        config = supabase_db_instance.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        result = supabase_db_instance.client.table("photo_faces").select(
            "id, photo_id, verified, recognition_confidence, gallery_images!inner(id, image_url, original_filename, gallery_id)"
        ).eq("person_id", person_id).or_(f"verified.eq.true,recognition_confidence.gte.{confidence_threshold}").execute()
        return ApiResponse.ok(result.data or [])
    except Exception as e:
        logger.error(f"Error getting person photos: {e}")
        raise DatabaseError(str(e), operation="get_person_photos")


@router.post("")
async def create_person(data: PersonCreate):
    """Create a new person."""
    try:
        insert_data = data.model_dump(exclude_none=True)
        result = supabase_db_instance.client.table("people").insert(insert_data).execute()
        if result.data:
            logger.info(f"Created person: {data.real_name}")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_person")
    except Exception as e:
        logger.error(f"Error creating person: {e}")
        raise DatabaseError(str(e), operation="create_person")


@router.put("/{person_id}")
async def update_person(person_id: str, data: PersonUpdate):
    """Update a person."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db_instance.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Updated person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", person_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating person {person_id}: {e}")
        raise DatabaseError(str(e), operation="update_person")


@router.patch("/{person_id}/avatar")
async def update_avatar(person_id: str, avatar_url: str = Query(...)):
    """Update person's avatar."""
    try:
        result = supabase_db_instance.client.table("people").update({"avatar_url": avatar_url}).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Updated avatar for person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", person_id)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating avatar: {e}")
        raise DatabaseError(str(e), operation="update_avatar")


@router.patch("/{person_id}/visibility")
async def update_visibility(person_id: str, data: VisibilityUpdate):
    """Update person's visibility settings."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db_instance.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", person_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating visibility: {e}")
        raise DatabaseError(str(e), operation="update_visibility")


@router.delete("/{person_id}")
async def delete_person(person_id: str):
    """Delete a person and cleanup related data."""
    try:
        # Delete face descriptors (legacy table)
        supabase_db_instance.client.table("face_descriptors").delete().eq("person_id", person_id).execute()
        
        # Unlink photo_faces
        supabase_db_instance.client.table("photo_faces").update(
            {"person_id": None, "verified": False}
        ).eq("person_id", person_id).execute()
        
        # Delete person
        supabase_db_instance.client.table("people").delete().eq("id", person_id).execute()
        
        # Rebuild index
        index_rebuilt = False
        if face_service_instance:
            await face_service_instance.rebuild_players_index()
            index_rebuilt = True
        
        logger.info(f"Deleted person {person_id}")
        return ApiResponse.ok({"deleted": True, "index_rebuilt": index_rebuilt})
    except Exception as e:
        logger.error(f"Error deleting person {person_id}: {e}")
        raise DatabaseError(str(e), operation="delete_person")


@router.post("/{person_id}/verify-on-photo")
async def verify_person_on_photo(person_id: str, photo_id: str = Query(...)):
    """Верифицирует человека на конкретном фото."""
    try:
        logger.info(f"Verifying person {person_id} on photo {photo_id}")
        
        result = supabase_db_instance.client.table("photo_faces")\
            .update({"verified": True, "recognition_confidence": 1.0})\
            .eq("photo_id", photo_id)\
            .eq("person_id", person_id)\
            .execute()
        
        if result.data:
            logger.info(f"Person verified on photo successfully")
            return ApiResponse.ok({"verified": True})
        raise NotFoundError("Face", f"{person_id} on photo {photo_id}")
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error verifying person on photo: {e}")
        raise DatabaseError(str(e), operation="verify_person_on_photo")


@router.post("/{person_id}/unlink-from-photo")
async def unlink_person_from_photo(person_id: str, photo_id: str = Query(...)):
    """Отвязывает человека от фото."""
    try:
        logger.info(f"Unlinking person {person_id} from photo {photo_id}")
        
        result = supabase_db_instance.client.table("photo_faces")\
            .update({
                "person_id": None,
                "verified": False,
                "verified_at": None,
                "verified_by": None,
                "recognition_confidence": None
            })\
            .eq("photo_id", photo_id)\
            .eq("person_id", person_id)\
            .select()\
            .execute()
        
        logger.info(f"Unlinked {len(result.data or [])} faces")
        return ApiResponse.ok({"unlinked_count": len(result.data or [])})
    except Exception as e:
        logger.error(f"Error unlinking person from photo: {e}")
        raise DatabaseError(str(e), operation="unlink_person_from_photo")


@router.get("/{person_id}/photos-with-details")
async def get_person_photos_with_details(person_id: str):
    """Получает фотографии человека с детальной информацией."""
    try:
        logger.info(f"Getting photos with details for person {person_id}")
        
        config = supabase_db_instance.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Получаем все photo_faces для этого человека
        photo_faces_result = supabase_db_instance.client.table("photo_faces")\
            .select(
                "id, photo_id, recognition_confidence, verified, insightface_bbox, person_id, "
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
                
                photos_map[photo_id] = {
                    **gi,
                    "faceId": pf["id"],
                    "confidence": pf.get("recognition_confidence"),
                    "verified": is_verified,
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
        all_faces_result = supabase_db_instance.client.table("photo_faces")\
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
        
    except Exception as e:
        logger.error(f"Error getting photos with details: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="get_person_photos_with_details")


async def _calculate_people_stats(people: list) -> list:
    """Calculate face statistics for all people.
    
    Counts:
    - verified_photos_count: photos where person is verified
    - high_confidence_photos_count: photos with high confidence (not verified)
    - descriptor_count: total photo_faces with embeddings for this person
    """
    try:
        config = supabase_db_instance.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Load all photo_faces with their embedding status
        all_faces = []
        offset = 0
        page_size = 1000
        while True:
            faces_result = supabase_db_instance.client.table("photo_faces").select(
                "person_id, photo_id, verified, recognition_confidence"
            ).not_.is_("insightface_descriptor", "null").range(offset, offset + page_size - 1).execute()
            
            batch = faces_result.data or []
            all_faces.extend(batch)
            
            if len(batch) < page_size:
                break
            offset += page_size
        
        logger.info(f"Loaded {len(all_faces)} photo_faces with embeddings for stats")
        
        # Count descriptors (faces with embeddings) per person
        descriptor_counts = {}
        for f in all_faces:
            pid = f.get("person_id")
            if pid:
                descriptor_counts[pid] = descriptor_counts.get(pid, 0) + 1
        
        # Calculate stats for each person
        result = []
        for person in people:
            person_id = person["id"]
            person_faces = [f for f in all_faces if f.get("person_id") == person_id]
            
            verified_photos = set()
            high_conf_photos = set()
            
            for face in person_faces:
                photo_id = face.get("photo_id")
                if face.get("verified"):
                    verified_photos.add(photo_id)
                elif (face.get("recognition_confidence") or 0) >= confidence_threshold:
                    high_conf_photos.add(photo_id)
            
            # Remove from high_conf those already verified
            high_conf_photos -= verified_photos
            
            result.append({
                **person,
                "verified_photos_count": len(verified_photos),
                "high_confidence_photos_count": len(high_conf_photos),
                "descriptor_count": descriptor_counts.get(person_id, 0)
            })
        
        return result
    except Exception as e:
        logger.error(f"Error calculating stats: {e}")
        return people
