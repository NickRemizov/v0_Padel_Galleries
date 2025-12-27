"""
People API - CRUD Operations
Basic CRUD endpoints: list, get, create, update, delete

v1.0: Original implementation
v1.3: Removed per-endpoint auth (moved to middleware)
v1.4: Added for_gallery parameter for optimized players gallery loading
"""

from fastapi import APIRouter, Query
from uuid import UUID

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger

from .models import PersonCreate, PersonUpdate
from .helpers import (
    get_supabase_db,
    get_face_service,
    resolve_person,
    get_person_id,
    calculate_people_stats,
)

logger = get_logger(__name__)
router = APIRouter()


@router.get("/")
async def get_people(
    with_stats: bool = Query(False),
    for_gallery: bool = Query(False, description="Optimized response for players gallery page")
):
    """
    Get all people.
    
    Parameters:
    - with_stats: Include face verification stats (slower)
    - for_gallery: Include photo_count and most_recent_gallery_date (optimized for /players page)
    """
    supabase_db = get_supabase_db()
    
    try:
        result = supabase_db.client.table("people").select("*").order("real_name").execute()
        people = result.data or []
        
        # For players gallery page - add photo_count and most_recent_gallery_date
        if for_gallery:
            people = await _add_gallery_data(people)
            return ApiResponse.ok(people)
        
        if not with_stats:
            return ApiResponse.ok(people)
        
        people_with_stats = await calculate_people_stats(people)
        return ApiResponse.ok(people_with_stats)
    except Exception as e:
        logger.error(f"Error getting people: {e}")
        raise DatabaseError(str(e), operation="get_people")


async def _add_gallery_data(people: list) -> list:
    """
    Add photo_count and most_recent_gallery_date to each person.
    Uses efficient SQL to get all data in one query.
    
    v1.4: Optimized for players gallery page - eliminates N+1 problem
    """
    if not people:
        return people
    
    supabase_db = get_supabase_db()
    
    try:
        # Get aggregated data for all people in one query
        # Join: photo_faces -> gallery_images -> galleries
        # This gets photo_count and max shoot_date per person
        
        # Step 1: Get all photo_faces with gallery info (paginated)
        all_faces = []
        offset = 0
        page_size = 1000
        
        while True:
            faces_result = supabase_db.client.table("photo_faces").select(
                "person_id, photo_id, gallery_images!inner(gallery_id, galleries!inner(shoot_date))"
            ).not_.is_("person_id", "null").range(offset, offset + page_size - 1).execute()
            
            batch = faces_result.data or []
            all_faces.extend(batch)
            
            if len(batch) < page_size:
                break
            offset += page_size
        
        logger.debug(f"Loaded {len(all_faces)} photo_faces for gallery data")
        
        # Step 2: Aggregate per person
        person_data = {}  # person_id -> {photo_ids: set, dates: list}
        
        for face in all_faces:
            person_id = face.get("person_id")
            if not person_id:
                continue
            
            if person_id not in person_data:
                person_data[person_id] = {"photo_ids": set(), "dates": []}
            
            photo_id = face.get("photo_id")
            if photo_id:
                person_data[person_id]["photo_ids"].add(photo_id)
            
            # Extract shoot_date from nested structure
            gallery_images = face.get("gallery_images")
            if gallery_images:
                galleries = gallery_images.get("galleries")
                if galleries:
                    shoot_date = galleries.get("shoot_date")
                    if shoot_date:
                        person_data[person_id]["dates"].append(shoot_date)
        
        # Step 3: Add to people
        result = []
        for person in people:
            person_id = person["id"]
            data = person_data.get(person_id, {"photo_ids": set(), "dates": []})
            
            # Get most recent date
            dates = data["dates"]
            most_recent_date = max(dates) if dates else None
            
            result.append({
                **person,
                "photo_count": len(data["photo_ids"]),
                "most_recent_gallery_date": most_recent_date,
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Error adding gallery data: {e}")
        # Fallback - return people without gallery data
        return [{**p, "photo_count": 0, "most_recent_gallery_date": None} for p in people]


@router.post("/")
async def create_person(data: PersonCreate):
    """Create a new person."""
    supabase_db = get_supabase_db()
    
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


# ============ SLUG-BASED ROUTES ============

@router.get("/slug/{slug}")
async def get_person_by_slug(slug: str):
    """Get a person by slug."""
    try:
        person = resolve_person(slug)
        if person:
            return ApiResponse.ok(person)
        raise NotFoundError("Person", slug)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting person by slug {slug}: {e}")
        raise DatabaseError(str(e), operation="get_person_by_slug")


# ============ UUID-BASED ROUTES ============

@router.get("/{identifier:uuid}")
async def get_person(identifier: UUID):
    """Get a person by UUID."""
    supabase_db = get_supabase_db()
    
    try:
        result = supabase_db.client.table("people").select("*").eq("id", str(identifier)).execute()
        if result.data and len(result.data) > 0:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", str(identifier))
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting person {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_person")


@router.put("/{identifier:uuid}")
async def update_person(identifier: UUID, data: PersonUpdate):
    """Update a person by UUID."""
    supabase_db = get_supabase_db()
    
    try:
        # Verify person exists
        result = supabase_db.client.table("people").select("id").eq("id", str(identifier)).execute()
        if not result.data:
            raise NotFoundError("Person", str(identifier))
        person_id = str(identifier)
        
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Updated person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", str(identifier))
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating person {identifier}: {e}")
        raise DatabaseError(str(e), operation="update_person")


@router.delete("/{identifier:uuid}")
async def delete_person(identifier: UUID):
    """Delete a person and cleanup related data."""
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    try:
        # Verify person exists
        result = supabase_db.client.table("people").select("id").eq("id", str(identifier)).execute()
        if not result.data:
            raise NotFoundError("Person", str(identifier))
        person_id = str(identifier)
        
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
