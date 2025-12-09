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


class LocationUpdate(BaseModel):
    name: str


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
        result = supabase_db_instance.client.table("locations").insert({"name": data.name}).execute()
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
        result = supabase_db_instance.client.table("locations").update({"name": data.name}).eq("id", location_id).execute()
        if result.data:
            logger.info(f"[Locations API] Updated location {location_id}: {data.name}")
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
