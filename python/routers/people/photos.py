"""
People API - Photo Operations
Endpoints for person's photos: get photos, photos with details, verify, unlink
"""

from fastapi import APIRouter, Query, Depends

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)
router = APIRouter()


def get_supabase_db() -> SupabaseDatabase:
    from . import supabase_db_instance
    return supabase_db_instance


def get_person_id(identifier: str) -> str:
    from . import _get_person_id
    return _get_person_id(identifier)


@router.get("/{identifier}/photos")
async def get_person_photos(
    identifier: str,
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Get all photos containing this person with gallery info for sorting."""
    try:
        person_id = get_person_id(identifier)
        
        config = supabase_db.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Include galleries join for title, shoot_date, sort_order
        # Added: original_url, file_size, width, height for lightbox display
        result = supabase_db.client.table("photo_faces").select(
            "id, photo_id, verified, recognition_confidence, "
            "gallery_images!inner(id, image_url, original_url, original_filename, file_size, width, height, gallery_id, created_at, "
            "galleries(id, title, shoot_date, sort_order))"
        ).eq("person_id", person_id).or_(f"verified.eq.true,recognition_confidence.gte.{confidence_threshold}").execute()
        return ApiResponse.ok(result.data or [])
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting person photos: {e}")
        raise DatabaseError(str(e), operation="get_person_photos")


@router.get("/{identifier}/photos-with-details")
async def get_person_photos_with_details(
    identifier: str,
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Get person's photos with detailed information, including excluded_from_index."""
    try:
        person_id = get_person_id(identifier)
        
        logger.info(f"Getting photos with details for person {person_id}")
        
        config = supabase_db.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Get all photo_faces for this person (including excluded_from_index)
        photo_faces_result = supabase_db.client.table("photo_faces").select(
            "id, photo_id, recognition_confidence, verified, insightface_bbox, person_id, excluded_from_index, "
            "gallery_images(id, image_url, gallery_id, width, height, original_filename, galleries(shoot_date, title))"
        ).eq("person_id", person_id).execute()
        
        all_photo_faces = photo_faces_result.data or []
        
        # Filter by verified or confidence
        photo_faces = [
            pf for pf in all_photo_faces
            if pf.get("verified") == True or (pf.get("recognition_confidence") or 0) >= confidence_threshold
        ]
        
        logger.info(f"Found {len(all_photo_faces)} total, {len(photo_faces)} after filtering")
        
        # Collect unique photos
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
        
        # Get all faces for these photos
        all_faces_result = supabase_db.client.table("photo_faces").select(
            "id, photo_id, person_id, verified, recognition_confidence, people(real_name, telegram_name)"
        ).in_("photo_id", photo_ids).or_(f"verified.eq.true,recognition_confidence.gte.{confidence_threshold}").execute()
        
        all_faces = all_faces_result.data or []
        
        # Collect "other faces" for each photo
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


@router.post("/{identifier}/verify-on-photo")
async def verify_person_on_photo(
    identifier: str, 
    photo_id: str = Query(...),
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Verify person on a specific photo."""
    try:
        person_id = get_person_id(identifier)
        
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


@router.post("/{identifier}/unlink-from-photo")
async def unlink_person_from_photo(
    identifier: str, 
    photo_id: str = Query(...),
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Unlink person from a photo."""
    try:
        person_id = get_person_id(identifier)
        
        logger.info(f"Unlinking person {person_id} from photo {photo_id}")
        
        # First, count how many faces will be affected
        count_result = supabase_db.client.table("photo_faces")\
            .select("id", count="exact")\
            .eq("photo_id", photo_id)\
            .eq("person_id", person_id)\
            .execute()
        
        faces_count = count_result.count if hasattr(count_result, 'count') else len(count_result.data or [])
        logger.info(f"Found {faces_count} faces to unlink")
        
        # Then update (without .select() which doesn't work in sync client)
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
        return ApiResponse.ok({"unlinked_count": faces_count})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error unlinking person from photo: {e}")
        raise DatabaseError(str(e), operation="unlink_person_from_photo")
