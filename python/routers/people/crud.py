"""
People API - CRUD Operations
Basic CRUD endpoints: list, get, create, update, delete
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
async def get_people(with_stats: bool = Query(False)):
    """Get all people, optionally with face stats."""
    supabase_db = get_supabase_db()
    
    try:
        result = supabase_db.client.table("people").select("*").order("real_name").execute()
        people = result.data or []
        
        if not with_stats:
            return ApiResponse.ok(people)
        
        people_with_stats = await calculate_people_stats(people)
        return ApiResponse.ok(people_with_stats)
    except Exception as e:
        logger.error(f"Error getting people: {e}")
        raise DatabaseError(str(e), operation="get_people")


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
