"""
Organizers API Router
CRUD operations for organizers

v1.1: Migrated to SupabaseService
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from services.supabase import SupabaseService

logger = get_logger(__name__)
router = APIRouter()

supabase_db_instance: SupabaseService = None

PG_UNIQUE_VIOLATION = "23505"
PG_FOREIGN_KEY_VIOLATION = "23503"


def set_services(supabase_db: SupabaseService):
    global supabase_db_instance
    supabase_db_instance = supabase_db


class OrganizerCreate(BaseModel):
    name: str


class OrganizerUpdate(BaseModel):
    name: Optional[str] = None


@router.get("")
async def get_organizers():
    """Get all organizers."""
    try:
        result = supabase_db_instance.client.table("organizers").select("*").order("name").execute()
        return ApiResponse.ok(result.data or [])
    except Exception as e:
        logger.error(f"Error getting organizers: {e}")
        raise DatabaseError(str(e), operation="get_organizers")


@router.get("/{organizer_id}")
async def get_organizer(organizer_id: str):
    """Get an organizer by ID."""
    try:
        result = supabase_db_instance.client.table("organizers").select("*").eq("id", organizer_id).execute()
        if result.data and len(result.data) > 0:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Organizer", organizer_id)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting organizer {organizer_id}: {e}")
        raise DatabaseError(str(e), operation="get_organizer")


@router.post("")
async def create_organizer(data: OrganizerCreate):
    """Create a new organizer."""
    try:
        result = supabase_db_instance.client.table("organizers").insert({"name": data.name}).execute()
        if result.data:
            logger.info(f"Created organizer: {data.name}")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_organizer")
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error creating organizer: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Организатор с таким именем уже существует", field="name", code=PG_UNIQUE_VIOLATION)
        raise DatabaseError(error_str, operation="create_organizer")


@router.put("/{organizer_id}")
async def update_organizer(organizer_id: str, data: OrganizerUpdate):
    """Update an organizer."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
            
        result = supabase_db_instance.client.table("organizers").update(update_data).eq("id", organizer_id).execute()
        if result.data:
            logger.info(f"Updated organizer {organizer_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Organizer", organizer_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error updating organizer {organizer_id}: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Организатор с таким именем уже существует", field="name", code=PG_UNIQUE_VIOLATION)
        raise DatabaseError(error_str, operation="update_organizer")


@router.delete("/{organizer_id}")
async def delete_organizer(organizer_id: str):
    """Delete an organizer."""
    try:
        supabase_db_instance.client.table("organizers").delete().eq("id", organizer_id).execute()
        logger.info(f"Deleted organizer {organizer_id}")
        return ApiResponse.ok({"deleted": True})
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error deleting organizer {organizer_id}: {e}")
        if "23503" in error_str or "foreign key" in error_str.lower():
            raise ValidationError("Невозможно удалить: есть связанные галереи", code=PG_FOREIGN_KEY_VIOLATION)
        raise DatabaseError(error_str, operation="delete_organizer")
