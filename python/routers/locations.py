"""
Locations API Router
CRUD operations for locations (venues)

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


class LocationCreate(BaseModel):
    name: str
    city_id: Optional[str] = None
    address: Optional[str] = None
    maps_url: Optional[str] = None
    website_url: Optional[str] = None


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    city_id: Optional[str] = None
    address: Optional[str] = None
    maps_url: Optional[str] = None
    website_url: Optional[str] = None


@router.get("")
async def get_locations():
    """Get all locations with city info."""
    try:
        result = supabase_db_instance.client.table("locations").select(
            "*, cities(id, name, slug)"
        ).order("name").execute()
        return ApiResponse.ok(result.data or [])
    except Exception as e:
        logger.error(f"Error getting locations: {e}")
        raise DatabaseError(str(e), operation="get_locations")


@router.get("/{location_id}")
async def get_location(location_id: str):
    """Get a location by ID."""
    try:
        result = supabase_db_instance.client.table("locations").select(
            "*, cities(id, name, slug)"
        ).eq("id", location_id).execute()
        if result.data and len(result.data) > 0:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Location", location_id)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting location {location_id}: {e}")
        raise DatabaseError(str(e), operation="get_location")


@router.post("")
async def create_location(data: LocationCreate):
    """Create a new location."""
    try:
        insert_data = data.model_dump(exclude_none=True)
        result = supabase_db_instance.client.table("locations").insert(insert_data).execute()
        if result.data:
            logger.info(f"Created location: {data.name}")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_location")
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error creating location: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Площадка с таким названием уже существует", field="name", code=PG_UNIQUE_VIOLATION)
        raise DatabaseError(error_str, operation="create_location")


@router.put("/{location_id}")
async def update_location(location_id: str, data: LocationUpdate):
    """Update a location."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
            
        result = supabase_db_instance.client.table("locations").update(update_data).eq("id", location_id).execute()
        if result.data:
            logger.info(f"Updated location {location_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Location", location_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error updating location {location_id}: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Площадка с таким названием уже существует", field="name", code=PG_UNIQUE_VIOLATION)
        raise DatabaseError(error_str, operation="update_location")


@router.delete("/{location_id}")
async def delete_location(location_id: str):
    """Delete a location."""
    try:
        supabase_db_instance.client.table("locations").delete().eq("id", location_id).execute()
        logger.info(f"Deleted location {location_id}")
        return ApiResponse.ok({"deleted": True})
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error deleting location {location_id}: {e}")
        if "23503" in error_str or "foreign key" in error_str.lower():
            raise ValidationError("Невозможно удалить: есть связанные галереи", code=PG_FOREIGN_KEY_VIOLATION)
        raise DatabaseError(error_str, operation="delete_location")
