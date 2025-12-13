from fastapi import APIRouter, HTTPException, Depends
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
    """Get all locations ordered by name."""
    try:
        result = supabase_db_instance.client.table("locations").select("*").order("name").execute()
        return {"success": True, "data": result.data or []}
    except Exception as e:
        logger.error(f"[Locations API] Error getting locations: {e}")
        return {"success": False, "error": str(e), "data": []}


@router.get("/{location_id}")
async def get_location(location_id: str):
    """Get a location by ID."""
    try:
        result = supabase_db_instance.client.table("locations").select("*").eq("id", location_id).execute()
        if result.data and len(result.data) > 0:
            return {"success": True, "data": result.data[0]}
        raise HTTPException(status_code=404, detail="Location not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Locations API] Error getting location {location_id}: {e}")
        return {"success": False, "error": str(e)}


@router.post("")
async def create_location(data: LocationCreate):
    """Create a new location."""
    try:
        insert_data = {"name": data.name}
        if data.city_id:
            insert_data["city_id"] = data.city_id
        if data.address:
            insert_data["address"] = data.address
        if data.maps_url:
            insert_data["maps_url"] = data.maps_url
        if data.website_url:
            insert_data["website_url"] = data.website_url
            
        result = supabase_db_instance.client.table("locations").insert(insert_data).execute()
        if result.data:
            logger.info(f"[Locations API] Created location: {data.name}")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        logger.error(f"[Locations API] Error creating location: {e}")
        return {"success": False, "error": str(e)}


@router.put("/{location_id}")
async def update_location(location_id: str, data: LocationUpdate):
    """Update a location."""
    try:
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name
        if data.city_id is not None:
            update_data["city_id"] = data.city_id if data.city_id else None
        if data.address is not None:
            update_data["address"] = data.address if data.address else None
        if data.maps_url is not None:
            update_data["maps_url"] = data.maps_url if data.maps_url else None
        if data.website_url is not None:
            update_data["website_url"] = data.website_url if data.website_url else None
            
        if not update_data:
            return {"success": False, "error": "No fields to update"}
            
        result = supabase_db_instance.client.table("locations").update(update_data).eq("id", location_id).execute()
        if result.data:
            logger.info(f"[Locations API] Updated location {location_id}")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        logger.error(f"[Locations API] Error updating location {location_id}: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/{location_id}")
async def delete_location(location_id: str):
    """Delete a location."""
    try:
        supabase_db_instance.client.table("locations").delete().eq("id", location_id).execute()
        logger.info(f"[Locations API] Deleted location {location_id}")
        return {"success": True}
    except Exception as e:
        logger.error(f"[Locations API] Error deleting location {location_id}: {e}")
        return {"success": False, "error": str(e)}
