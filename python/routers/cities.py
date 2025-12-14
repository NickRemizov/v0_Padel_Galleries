"""
Cities API Router
CRUD operations for cities
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


class CityCreate(BaseModel):
    name: str
    slug: str
    country: Optional[str] = "Spain"
    is_active: Optional[bool] = True


class CityUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    country: Optional[str] = None
    is_active: Optional[bool] = None


# PostgreSQL error codes
PG_UNIQUE_VIOLATION = "23505"
PG_FOREIGN_KEY_VIOLATION = "23503"


@router.get("")
async def get_cities(active_only: bool = False):
    """Get all cities ordered by name."""
    try:
        query = supabase_db_instance.client.table("cities").select("*")
        if active_only:
            query = query.eq("is_active", True)
        result = query.order("name").execute()
        return ApiResponse.ok(result.data or [])
    except Exception as e:
        logger.error(f"Error getting cities: {e}")
        raise DatabaseError(str(e), operation="get_cities")


@router.get("/{city_id}")
async def get_city(city_id: str):
    """Get a city by ID."""
    try:
        result = supabase_db_instance.client.table("cities").select("*").eq("id", city_id).execute()
        if result.data and len(result.data) > 0:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("City", city_id)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting city {city_id}: {e}")
        raise DatabaseError(str(e), operation="get_city")


@router.post("")
async def create_city(data: CityCreate):
    """Create a new city."""
    try:
        insert_data = {
            "name": data.name,
            "slug": data.slug,
            "country": data.country,
            "is_active": data.is_active
        }
        result = supabase_db_instance.client.table("cities").insert(insert_data).execute()
        if result.data:
            logger.info(f"Created city: {data.name} ({data.slug})")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_city")
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error creating city: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            # Use PostgreSQL error code for frontend compatibility
            raise ValidationError("Город с таким slug уже существует", code=PG_UNIQUE_VIOLATION)
        raise DatabaseError(error_str, operation="create_city")


@router.put("/{city_id}")
async def update_city(city_id: str, data: CityUpdate):
    """Update a city."""
    try:
        update_data = data.model_dump(exclude_none=True)
            
        if not update_data:
            raise ValidationError("No fields to update")
            
        result = supabase_db_instance.client.table("cities").update(update_data).eq("id", city_id).execute()
        if result.data:
            logger.info(f"Updated city {city_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("City", city_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error updating city {city_id}: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise ValidationError("Город с таким slug уже существует", code=PG_UNIQUE_VIOLATION)
        raise DatabaseError(error_str, operation="update_city")


@router.patch("/{city_id}/toggle")
async def toggle_city_active(city_id: str):
    """Toggle city active status."""
    try:
        get_result = supabase_db_instance.client.table("cities").select("is_active").eq("id", city_id).execute()
        if not get_result.data:
            raise NotFoundError("City", city_id)
        
        current_active = get_result.data[0]["is_active"]
        new_active = not current_active
        
        result = supabase_db_instance.client.table("cities").update({"is_active": new_active}).eq("id", city_id).execute()
        if result.data:
            logger.info(f"Toggled city {city_id} active: {new_active}")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Toggle failed", operation="toggle_city")
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error toggling city {city_id}: {e}")
        raise DatabaseError(str(e), operation="toggle_city")


@router.delete("/{city_id}")
async def delete_city(city_id: str):
    """Delete a city."""
    try:
        supabase_db_instance.client.table("cities").delete().eq("id", city_id).execute()
        logger.info(f"Deleted city {city_id}")
        return ApiResponse.ok({"deleted": True})
    except Exception as e:
        error_str = str(e)
        logger.error(f"Error deleting city {city_id}: {e}")
        if "23503" in error_str or "foreign key" in error_str.lower():
            raise ValidationError("Невозможно удалить: есть связанные площадки", code=PG_FOREIGN_KEY_VIOLATION)
        raise DatabaseError(error_str, operation="delete_city")
