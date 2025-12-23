"""
People API - CRUD Operations
Basic CRUD endpoints: get all, get by id, create, update, delete, visibility
"""

from fastapi import APIRouter, Query, Depends

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService

from .models import PersonCreate, PersonUpdate, VisibilityUpdate

logger = get_logger(__name__)
router = APIRouter()


def get_supabase_db() -> SupabaseDatabase:
    from . import supabase_db_instance
    return supabase_db_instance


def get_face_service() -> FaceRecognitionService:
    from . import face_service_instance
    return face_service_instance


def get_person_id(identifier: str) -> str:
    from . import _get_person_id
    return _get_person_id(identifier)


def resolve_person(identifier: str):
    from . import _resolve_person
    return _resolve_person(identifier)


async def _calculate_people_stats(people: list, supabase_db: SupabaseDatabase) -> list:
    """Calculate face statistics for all people.
    
    Counts:
    - verified_photos_count: photos where person is verified
    - high_confidence_photos_count: photos with high confidence (not verified)
    - descriptor_count: total photo_faces with embeddings for this person
    - excluded_count: descriptors excluded from index
    """
    try:
        config = supabase_db.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Load all photo_faces with their embedding status
        all_faces = []
        offset = 0
        page_size = 1000
        while True:
            faces_result = supabase_db.client.table("photo_faces").select(
                "person_id, photo_id, verified, recognition_confidence, excluded_from_index"
            ).not_.is_("insightface_descriptor", "null").range(offset, offset + page_size - 1).execute()
            
            batch = faces_result.data or []
            all_faces.extend(batch)
            
            if len(batch) < page_size:
                break
            offset += page_size
        
        logger.info(f"Loaded {len(all_faces)} photo_faces with embeddings for stats")
        
        # Count descriptors (faces with embeddings) per person
        descriptor_counts = {}
        excluded_counts = {}
        for f in all_faces:
            pid = f.get("person_id")
            if pid:
                descriptor_counts[pid] = descriptor_counts.get(pid, 0) + 1
                if f.get("excluded_from_index"):
                    excluded_counts[pid] = excluded_counts.get(pid, 0) + 1
        
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
                "descriptor_count": descriptor_counts.get(person_id, 0),
                "excluded_count": excluded_counts.get(person_id, 0)
            })
        
        return result
    except Exception as e:
        logger.error(f"Error calculating stats: {e}")
        return people


@router.get("")
async def get_people(
    with_stats: bool = Query(False),
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Get all people, optionally with face stats."""
    try:
        result = supabase_db.client.table("people").select("*").order("real_name").execute()
        people = result.data or []
        
        if not with_stats:
            return ApiResponse.ok(people)
        
        people_with_stats = await _calculate_people_stats(people, supabase_db)
        return ApiResponse.ok(people_with_stats)
    except Exception as e:
        logger.error(f"Error getting people: {e}")
        raise DatabaseError(str(e), operation="get_people")


@router.get("/{identifier}")
async def get_person(
    identifier: str,
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Get a person by ID or slug."""
    try:
        person = resolve_person(identifier)
        if person:
            return ApiResponse.ok(person)
        raise NotFoundError("Person", identifier)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting person {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_person")


@router.post("")
async def create_person(
    data: PersonCreate,
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Create a new person."""
    try:
        insert_data = data.model_dump(exclude_none=True)
        result = supabase_db.client.table("people").insert(insert_data).execute()
        if result.data:
            logger.info(f"Created person: {data.real_name}")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_person")
    except Exception as e:
        logger.error(f"Error creating person: {e}")
        raise DatabaseError(str(e), operation="create_person")


@router.put("/{identifier}")
async def update_person(
    identifier: str, 
    data: PersonUpdate,
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Update a person by ID or slug."""
    try:
        person_id = get_person_id(identifier)
        
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Updated person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", identifier)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating person {identifier}: {e}")
        raise DatabaseError(str(e), operation="update_person")


@router.patch("/{identifier}/visibility")
async def update_visibility(
    identifier: str, 
    data: VisibilityUpdate,
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Update person's visibility settings."""
    try:
        person_id = get_person_id(identifier)
        
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", identifier)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating visibility: {e}")
        raise DatabaseError(str(e), operation="update_visibility")


@router.delete("/{identifier}")
async def delete_person(
    identifier: str,
    supabase_db: SupabaseDatabase = Depends(get_supabase_db),
    face_service: FaceRecognitionService = Depends(get_face_service)
):
    """Delete a person and cleanup related data."""
    try:
        person_id = get_person_id(identifier)
        
        # Cleanup deprecated face_descriptors table (if exists)
        for table_name in ["face_descriptors_DEPRECATED", "face_descriptors"]:
            try:
                supabase_db.client.table(table_name).delete().eq("person_id", person_id).execute()
                logger.debug(f"Cleaned up {table_name} for person {person_id}")
                break
            except Exception:
                continue
        
        # Unlink photo_faces (clear person_id, keep embeddings)
        supabase_db.client.table("photo_faces").update(
            {"person_id": None, "verified": False}
        ).eq("person_id", person_id).execute()
        
        # Delete person
        supabase_db.client.table("people").delete().eq("id", person_id).execute()
        
        # Rebuild index to remove stale references
        index_rebuilt = False
        if face_service:
            await face_service.rebuild_players_index()
            index_rebuilt = True
        
        logger.info(f"Deleted person {person_id}")
        return ApiResponse.ok({"deleted": True, "index_rebuilt": index_rebuilt})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting person {identifier}: {e}")
        raise DatabaseError(str(e), operation="delete_person")
