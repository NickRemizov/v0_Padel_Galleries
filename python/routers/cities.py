from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.supabase_database import SupabaseDatabase
import logging

logger = logging.getLogger(__name__)
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


@router.get("")
async def get_cities(active_only: bool = False):
    """Get all cities ordered by name."""
    try:
        query = supabase_db_instance.client.table("cities").select("*")
        if active_only:
            query = query.eq("is_active", True)
        result = query.order("name").execute()
        return {"success": True, "data": result.data or []}
    except Exception as e:
        logger.error(f"[Cities API] Error getting cities: {e}")
        return {"success": False, "error": str(e), "data": []}


@router.get("/{city_id}")
async def get_city(city_id: str):
    """Get a city by ID."""
    try:
        result = supabase_db_instance.client.table("cities").select("*").eq("id", city_id).execute()
        if result.data and len(result.data) > 0:
            return {"success": True, "data": result.data[0]}
        raise HTTPException(status_code=404, detail="City not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Cities API] Error getting city {city_id}: {e}")
        return {"success": False, "error": str(e)}


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
            logger.info(f"[Cities API] Created city: {data.name} ({data.slug})")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        error_str = str(e)
        logger.error(f"[Cities API] Error creating city: {e}")
        # Handle unique constraint violation
        if "23505" in error_str or "duplicate" in error_str.lower():
            return {"success": False, "error": "Город с таким slug уже существует", "code": "23505"}
        return {"success": False, "error": error_str}


@router.put("/{city_id}")
async def update_city(city_id: str, data: CityUpdate):
    """Update a city."""
    try:
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name
        if data.slug is not None:
            update_data["slug"] = data.slug
        if data.country is not None:
            update_data["country"] = data.country
        if data.is_active is not None:
            update_data["is_active"] = data.is_active
            
        if not update_data:
            return {"success": False, "error": "No fields to update"}
            
        result = supabase_db_instance.client.table("cities").update(update_data).eq("id", city_id).execute()
        if result.data:
            logger.info(f"[Cities API] Updated city {city_id}")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        error_str = str(e)
        logger.error(f"[Cities API] Error updating city {city_id}: {e}")
        if "23505" in error_str or "duplicate" in error_str.lower():
            return {"success": False, "error": "Город с таким slug уже существует", "code": "23505"}
        return {"success": False, "error": error_str}


@router.patch("/{city_id}/toggle")
async def toggle_city_active(city_id: str):
    """Toggle city active status."""
    try:
        # Get current status
        get_result = supabase_db_instance.client.table("cities").select("is_active").eq("id", city_id).execute()
        if not get_result.data:
            raise HTTPException(status_code=404, detail="City not found")
        
        current_active = get_result.data[0]["is_active"]
        new_active = not current_active
        
        result = supabase_db_instance.client.table("cities").update({"is_active": new_active}).eq("id", city_id).execute()
        if result.data:
            logger.info(f"[Cities API] Toggled city {city_id} active: {new_active}")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Toggle failed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Cities API] Error toggling city {city_id}: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/{city_id}")
async def delete_city(city_id: str):
    """Delete a city."""
    try:
        supabase_db_instance.client.table("cities").delete().eq("id", city_id).execute()
        logger.info(f"[Cities API] Deleted city {city_id}")
        return {"success": True}
    except Exception as e:
        error_str = str(e)
        logger.error(f"[Cities API] Error deleting city {city_id}: {e}")
        # Handle foreign key constraint violation
        if "23503" in error_str or "foreign key" in error_str.lower():
            return {"success": False, "error": "Невозможно удалить: есть связанные площадки", "code": "23503"}
        return {"success": False, "error": error_str}
