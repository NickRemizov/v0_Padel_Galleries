"""
Photographers API Router
CRUD operations for photographers
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)
router = APIRouter()

supabase_db_instance: SupabaseDatabase = None


def set_services(supabase_db: SupabaseDatabase):
    global supabase_db_instance
    supabase_db_instance = supabase_db


class PhotographerCreate(BaseModel):
    name: str
    slug: str
    bio: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    avatar_url: Optional[str] = None


class PhotographerUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    bio: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    avatar_url: Optional[str] = None


@router.get("")
async def get_photographers():
    """Get all photographers."""
    try:
        result = supabase_db_instance.client.table("photographers").select("*").order("name").execute()
        return ApiResponse.ok(result.data or [])
    except Exception as e:
        logger.error(f"Error getting photographers: {e}")
        raise DatabaseError(str(e), operation="get_photographers")


@router.get("/{photographer_id}")
async def get_photographer(photographer_id: str):
    """Get a photographer by ID."""
    try:
        result = supabase_db_instance.client.table("photographers").select("*").eq("id", photographer_id).execute()
        if result.data and len(result.data) > 0:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Photographer", photographer_id)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting photographer {photographer_id}: {e}")
        raise DatabaseError(str(e), operation="get_photographer")


@router.post("")
async def create_photographer(data: PhotographerCreate):
    """Create a new photographer."""
    try:
        insert_data = data.model_dump(exclude_none=True)
        result = supabase_db_instance.client.table("photographers").insert(insert_data).execute()
        if result.data:
            logger.info(f"Created photographer: {data.name}")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_photographer")
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error creating photographer: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Фотограф с таким slug уже существует", field="slug")
        raise DatabaseError(error_str, operation="create_photographer")


@router.put("/{photographer_id}")
async def update_photographer(photographer_id: str, data: PhotographerUpdate):
    """Update a photographer."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
            
        result = supabase_db_instance.client.table("photographers").update(update_data).eq("id", photographer_id).execute()
        if result.data:
            logger.info(f"Updated photographer {photographer_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Photographer", photographer_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error updating photographer {photographer_id}: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Фотограф с таким slug уже существует", field="slug")
        raise DatabaseError(error_str, operation="update_photographer")


@router.delete("/{photographer_id}")
async def delete_photographer(photographer_id: str):
    """Delete a photographer."""
    try:
        supabase_db_instance.client.table("photographers").delete().eq("id", photographer_id).execute()
        logger.info(f"Deleted photographer {photographer_id}")
        return ApiResponse.ok({"deleted": True})
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error deleting photographer {photographer_id}: {e}")
        if "23503" in error_str or "foreign key" in error_str.lower():
            raise ValidationError("Невозможно удалить: есть связанные галереи")
        raise DatabaseError(error_str, operation="delete_photographer")
