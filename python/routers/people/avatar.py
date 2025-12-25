"""
People API - Avatar & Visibility Operations
Endpoints for updating avatar and visibility settings
"""

from fastapi import APIRouter, Query
from uuid import UUID

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger

from .models import VisibilityUpdate
from .helpers import get_supabase_db

logger = get_logger(__name__)
router = APIRouter()


def _get_person_id_from_uuid(supabase_db, person_uuid: UUID) -> str:
    """Get person ID from UUID. Raises NotFoundError if not found."""
    result = supabase_db.client.table("people").select("id").eq("id", str(person_uuid)).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]["id"]
    raise NotFoundError("Person", str(person_uuid))


@router.patch("/{identifier:uuid}/avatar")
async def update_avatar(identifier: UUID, avatar_url: str = Query(...)):
    """Update person's avatar."""
    supabase_db = get_supabase_db()
    
    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)
        
        result = supabase_db.client.table("people").update({"avatar_url": avatar_url}).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Updated avatar for person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", str(identifier))
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating avatar: {e}")
        raise DatabaseError(str(e), operation="update_avatar")


@router.patch("/{identifier:uuid}/visibility")
async def update_visibility(identifier: UUID, data: VisibilityUpdate):
    """Update person's visibility settings."""
    supabase_db = get_supabase_db()
    
    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)
        
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", str(identifier))
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating visibility: {e}")
        raise DatabaseError(str(e), operation="update_visibility")
