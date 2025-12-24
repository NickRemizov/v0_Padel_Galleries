"""
People API - Avatar & Visibility Operations
Endpoints for updating avatar and visibility settings
"""

from fastapi import APIRouter, Query

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger

from .models import VisibilityUpdate
from .helpers import get_supabase_db, get_person_id

logger = get_logger(__name__)
router = APIRouter()


@router.patch("/{identifier}/avatar")
async def update_avatar(identifier: str, avatar_url: str = Query(...)):
    """Update person's avatar."""
    supabase_db = get_supabase_db()
    
    try:
        person_id = get_person_id(identifier)
        
        result = supabase_db.client.table("people").update({"avatar_url": avatar_url}).eq("id", person_id).execute()
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
    supabase_db = get_supabase_db()
    
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
