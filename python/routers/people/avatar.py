"""
People API - Avatar Operations
Endpoints for managing person's avatar
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


@router.patch("/{identifier}/avatar")
async def update_avatar(
    identifier: str, 
    avatar_url: str = Query(...),
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Update person's avatar."""
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
