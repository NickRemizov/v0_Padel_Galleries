"""
People API Router
CRUD and advanced operations for people (players)
Supports both UUID and slug identifiers for human-readable URLs
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, field_validator
from typing import Optional, List
import re

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


def set_services(supabase_db: SupabaseDatabase, face_service: FaceRecognitionService):
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service


def _resolve_person(identifier: str) -> Optional[dict]:
    """Resolve person by ID or slug."""
    return resolve_identifier(
        supabase_db_instance.client,
        "people",
        identifier,
        slug_column="slug"
    )


def _get_person_id(identifier: str) -> str:
    """Get person ID from identifier (ID or slug). Raises NotFoundError if not found."""
    person = _resolve_person(identifier)
    if not person:
        raise NotFoundError("Person", identifier)
    return person["id"]


class PersonCreate(BaseModel):
    real_name: str
    gmail: Optional[str] = None
    telegram_name: Optional[str] = None
    telegram_nickname: Optional[str] = None
    telegram_profile_url: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[float] = None
    avatar_url: Optional[str] = None
    show_in_players_gallery: bool = True
    show_photos_in_galleries: bool = True

    @field_validator('gmail')
    @classmethod
    def validate_gmail(cls, v):
        if v is not None and v != '':
            if not re.match(r'^[a-zA-Z0-9._%+-]+@gmail\.com$', v):
                raise ValueError('Gmail must be a valid @gmail.com address')
        return v or None


class PersonUpdate(BaseModel):
    real_name: Optional[str] = None
    gmail: Optional[str] = None
    telegram_name: Optional[str] = None
    telegram_nickname: Optional[str] = None
    telegram_profile_url: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[float] = None
    avatar_url: Optional[str] = None
    show_in_players_gallery: Optional[bool] = None
    show_photos_in_galleries: Optional[bool] = None

    @field_validator('gmail')
    @classmethod
    def validate_gmail(cls, v):
        if v is not None and v != '':
            if not re.match(r'^[a-zA-Z0-9._%+-]+@gmail\.com$', v):
                raise ValueError('Gmail must be a valid @gmail.com address')
        return v or None


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


# ============ CONSISTENCY AUDIT (must be before /{identifier}) ============

@router.get("/consistency-audit")
async def consistency_audit(
    outlier_threshold: float = Query(0.5, description="Similarity below this = outlier"),
    min_descriptors: int = Query(2, description="Skip people with fewer descriptors")
):
    """
    Audit embedding consistency for ALL people.
    
    Returns list of people with their consistency metrics, sorted by outlier count (worst first).
    Use this to find players with problematic embeddings.
    """
    import numpy as np
    import json
    
    try:
        logger.info(f"[consistency-audit] Starting audit, threshold={outlier_threshold}, min_descriptors={min_descriptors}")
        
        # Get all people
        people_result = supabase_db_instance.client.table("people").select(
            "id, real_name, telegram_name"
        ).order("real_name").execute()
        
        people = people_result.data or []
        logger.info(f"[consistency-audit] Found {len(people)} people")
        
        # Get confidence threshold for photo counting
        config = supabase_db_instance.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Load ALL photo_faces with embeddings (paginated)
        all_faces = []
        offset = 0
        page_size = 1000
        while True:
            faces_result = supabase_db_instance.client.table("photo_faces").select(
                "id, person_id, photo_id, verified, recognition_confidence, insightface_descriptor"
            ).not_.is_("person_id", "null").not_.is_("insightface_descriptor", "null").range(
                offset, offset + page_size - 1
            ).execute()
            
            batch = faces_result.data or []
            all_faces.extend(batch)
            
            if len(batch) < page_size:
                break
            offset += page_size
        
        logger.info(f"[consistency-audit] Loaded {len(all_faces)} faces with embeddings")
        
        # Group faces by person
        faces_by_person = {}
        for face in all_faces:
            pid = face.get("person_id")
            if pid:
                if pid not in faces_by_person:
                    faces_by_person[pid] = []
                faces_by_person[pid].append(face)
        
        # Process each person
        results = []
        processed = 0
        
        for person in people:
            person_id = person["id"]
            person_name = person.get("real_name") or person.get("telegram_name") or "Unknown"
            person_faces = faces_by_person.get(person_id, [])
            
            # Count photos (verified OR high confidence)
            photo_ids = set()
            for f in person_faces:
                if f.get("verified") or (f.get("recognition_confidence") or 0) >= confidence_threshold:
                    photo_ids.add(f.get("photo_id"))
            photo_count = len(photo_ids)
            
            descriptor_count = len(person_faces)
            
            # Skip if too few descriptors
            if descriptor_count < min_descriptors:
                continue
            
            # Parse embeddings
            embeddings = []
            for face in person_faces:
                descriptor = face.get("insightface_descriptor")
                try:
                    if isinstance(descriptor, list):
                        emb = np.array(descriptor, dtype=np.float32)
                    elif isinstance(descriptor, str):
                        emb = np.array(json.loads(descriptor), dtype=np.float32)
                    else:
                        continue
                    
                    if len(emb) == 512:
                        embeddings.append(emb)
                except Exception:
                    continue
            
            if len(embeddings) < 2:
                continue
            
            # Calculate centroid
            embeddings_array = np.array(embeddings)
            centroid = np.mean(embeddings_array, axis=0)
            centroid = centroid / np.linalg.norm(centroid)
            
            # Calculate similarities
            similarities = []
            outlier_count = 0
            for emb in embeddings:
                emb_norm = emb / np.linalg.norm(emb)
                sim = float(np.dot(emb_norm, centroid))
                similarities.append(sim)
                if sim < outlier_threshold:
                    outlier_count += 1
            
            overall_consistency = float(np.mean(similarities))
            
            results.append({
                "person_id": person_id,
                "person_name": person_name,
                "photo_count": photo_count,
                "descriptor_count": descriptor_count,
                "outlier_count": outlier_count,
                "overall_consistency": round(overall_consistency, 4),
                "has_problems": outlier_count > 0
            })
            
            processed += 1
            if processed % 50 == 0:
                logger.info(f"[consistency-audit] Processed {processed} people...")
        
        # Sort by outlier count (most problems first), then by consistency (lowest first)
        results.sort(key=lambda x: (-x["outlier_count"], x["overall_consistency"]))
        
        # Summary
        total_with_problems = sum(1 for r in results if r["has_problems"])
        total_outliers = sum(r["outlier_count"] for r in results)
        
        logger.info(f"[consistency-audit] Done. {len(results)} people checked, {total_with_problems} have problems, {total_outliers} total outliers")
        
        return ApiResponse.ok({
            "total_people": len(results),
            "people_with_problems": total_with_problems,
            "total_outliers": total_outliers,
            "outlier_threshold": outlier_threshold,
            "results": results
        })
        
    except Exception as e:
        logger.error(f"[consistency-audit] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="consistency_audit")


# ============ CRUD ENDPOINTS ============

@router.get("/{identifier}")
async def get_person(identifier: str):
    """Get a person by ID or slug."""
    try:
        person = _resolve_person(identifier)
        if person:
            return ApiResponse.ok(person)
        raise NotFoundError("Person", identifier)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting person {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_person")


@router.get("/{identifier}/photos")
async def get_person_photos(identifier: str):
    """Get all photos containing this person with gallery info for sorting."""
    try:
        person_id = _get_person_id(identifier)
        
        config = supabase_db_instance.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Include galleries join for title, shoot_date, sort_order
        result = supabase_db_instance.client.table("photo_faces").select(
            "id, photo_id, verified, recognition_confidence, "
            "gallery_images!inner(id, image_url, original_filename, gallery_id, created_at, "
            "galleries(id, title, shoot_date, sort_order))"
        ).eq("person_id", person_id).or_(f"verified.eq.true,recognition_confidence.gte.{confidence_threshold}").execute()
        return ApiResponse.ok(result.data or [])
    except NotFoundError:
        raise
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


@router.put("/{identifier}")
async def update_person(identifier: str, data: PersonUpdate):
    """Update a person by ID or slug."""
    try:
        person_id = _get_person_id(identifier)
        
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db_instance.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Updated person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", identifier)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating person {identifier}: {e}")
        raise DatabaseError(str(e), operation="update_person")


@router.patch("/{identifier}/avatar")
async def update_avatar(identifier: str, avatar_url: str = Query(...)):
    """Update person's avatar."""
    try:
        person_id = _get_person_id(identifier)
        
        result = supabase_db_instance.client.table("people").update({"avatar_url": avatar_url}).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Updated avatar for person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", identifier)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating avatar: {e}")
        raise DatabaseError(str(e), operation="update_avatar")


@router.patch("/{identifier}/visibility")
async def update_visibility(identifier: str, data: VisibilityUpdate):
    """Update person's visibility settings."""
    try:
        person_id = _get_person_id(identifier)
        
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db_instance.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", identifier)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating visibility: {e}")
        raise DatabaseError(str(e), operation="update_visibility")


@router.delete("/{identifier}")
async def delete_person(identifier: str):
    """Delete a person and cleanup related data."""
    try:
        person_id = _get_person_id(identifier)
        
        # Cleanup deprecated face_descriptors table (if exists)
        for table_name in ["face_descriptors_DEPRECATED", "face_descriptors"]:
            try:
                supabase_db_instance.client.table(table_name).delete().eq("person_id", person_id).execute()
                logger.debug(f"Cleaned up {table_name} for person {person_id}")
                break
            except Exception:
                continue
        
        # Unlink photo_faces (clear person_id, keep embeddings)
        supabase_db_instance.client.table("photo_faces").update(
            {"person_id": None, "verified": False}
        ).eq("person_id", person_id).execute()
        
        # Delete person
        supabase_db_instance.client.table("people").delete().eq("id", person_id).execute()
        
        # Rebuild index to remove stale references
        index_rebuilt = False
        if face_service_instance:
            await face_service_instance.rebuild_players_index()
            index_rebuilt = True
        
        logger.info(f"Deleted person {person_id}")
        return ApiResponse.ok({"deleted": True, "index_rebuilt": index_rebuilt})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting person {identifier}: {e}")
        raise DatabaseError(str(e), operation="delete_person")


@router.post("/{identifier}/verify-on-photo")
async def verify_person_on_photo(identifier: str, photo_id: str = Query(...)):
    """Верифицирует человека на конкретном фото."""
    try:
        person_id = _get_person_id(identifier)
        
        logger.info(f"Verifying person {person_id} on photo {photo_id}")
        
        result = supabase_db_instance.client.table("photo_faces")\
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


@router.post("/{identifier}/unlink-from-photo")
async def unlink_person_from_photo(identifier: str, photo_id: str = Query(...)):
    """Отвязывает человека от фото."""
    try:
        person_id = _get_person_id(identifier)
        
        logger.info(f"Unlinking person {person_id} from photo {photo_id}")
        
        # First, count how many faces will be affected
        count_result = supabase_db_instance.client.table("photo_faces")\
            .select("id", count="exact")\
            .eq("photo_id", photo_id)\
            .eq("person_id", person_id)\
            .execute()
        
        faces_count = count_result.count if hasattr(count_result, 'count') else len(count_result.data or [])
        logger.info(f"Found {faces_count} faces to unlink")
        
        # Then update (without .select() which doesn't work in sync client)
        supabase_db_instance.client.table("photo_faces")\
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
        return ApiResponse.ok({"unlinked_count": faces_count})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error unlinking person from photo: {e}")
        raise DatabaseError(str(e), operation="unlink_person_from_photo")


@router.get("/{identifier}/photos-with-details")
async def get_person_photos_with_details(identifier: str):
    """Получает фотографии человека с детальной информацией."""
    try:
        person_id = _get_person_id(identifier)
        
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
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting photos with details: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="get_person_photos_with_details")


@router.get("/{identifier}/embedding-consistency")
async def get_embedding_consistency(
    identifier: str,
    outlier_threshold: float = Query(0.5, description="Similarity below this = outlier")
):
    """
    Analyze consistency of person's embeddings to find outliers.
    
    Returns embeddings sorted by similarity to centroid (worst first).
    Outliers are embeddings that don't match the person's "average" face.
    """
    import numpy as np
    import json
    
    try:
        person_id = _get_person_id(identifier)
        
        logger.info(f"[consistency] Analyzing embeddings for person {person_id}")
        
        # Get all faces with embeddings for this person (include bbox and image dimensions)
        result = supabase_db_instance.client.table("photo_faces").select(
            "id, photo_id, verified, recognition_confidence, insightface_descriptor, insightface_bbox, "
            "gallery_images(id, image_url, original_filename, width, height)"
        ).eq("person_id", person_id).not_.is_("insightface_descriptor", "null").execute()
        
        faces = result.data or []
        
        if len(faces) < 2:
            return ApiResponse.ok({
                "total_embeddings": len(faces),
                "overall_consistency": 1.0 if faces else 0.0,
                "outlier_threshold": outlier_threshold,
                "embeddings": [],
                "message": "Need at least 2 embeddings to analyze consistency"
            })
        
        logger.info(f"[consistency] Found {len(faces)} faces with embeddings")
        
        # Parse embeddings
        embeddings = []
        valid_faces = []
        for face in faces:
            descriptor = face["insightface_descriptor"]
            if isinstance(descriptor, list):
                emb = np.array(descriptor, dtype=np.float32)
            elif isinstance(descriptor, str):
                emb = np.array(json.loads(descriptor), dtype=np.float32)
            else:
                continue
            
            if len(emb) == 512:
                embeddings.append(emb)
                valid_faces.append(face)
            else:
                logger.warning(f"[consistency] Invalid embedding dim {len(emb)} for face {face['id']}")
        
        if len(embeddings) < 2:
            return ApiResponse.ok({
                "total_embeddings": len(embeddings),
                "overall_consistency": 1.0,
                "outlier_threshold": outlier_threshold,
                "embeddings": [],
                "message": "Not enough valid embeddings"
            })
        
        # Calculate centroid (normalized mean)
        embeddings_array = np.array(embeddings)
        centroid = np.mean(embeddings_array, axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        
        # Calculate similarity to centroid for each embedding
        results = []
        similarities = []
        
        for i, face in enumerate(valid_faces):
            emb = embeddings[i]
            emb_norm = emb / np.linalg.norm(emb)
            similarity = float(np.dot(emb_norm, centroid))
            similarities.append(similarity)
            
            gi = face.get("gallery_images") or {}
            
            results.append({
                "face_id": face["id"],
                "photo_id": face["photo_id"],
                "image_url": gi.get("image_url"),
                "filename": gi.get("original_filename"),
                "image_width": gi.get("width"),
                "image_height": gi.get("height"),
                "bbox": face.get("insightface_bbox"),
                "verified": face.get("verified", False),
                "recognition_confidence": face.get("recognition_confidence"),
                "similarity_to_centroid": round(similarity, 4),
                "is_outlier": similarity < outlier_threshold
            })
        
        # Sort by similarity (worst first)
        results.sort(key=lambda x: x["similarity_to_centroid"])
        
        # Calculate overall consistency
        overall_consistency = float(np.mean(similarities)) if similarities else 0.0
        outlier_count = sum(1 for r in results if r["is_outlier"])
        
        logger.info(f"[consistency] Overall: {overall_consistency:.3f}, outliers: {outlier_count}/{len(results)}")
        
        return ApiResponse.ok({
            "total_embeddings": len(results),
            "overall_consistency": round(overall_consistency, 4),
            "outlier_threshold": outlier_threshold,
            "outlier_count": outlier_count,
            "embeddings": results
        })
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"[consistency] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="get_embedding_consistency")


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
