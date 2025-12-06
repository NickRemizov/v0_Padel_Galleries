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


class PhotographerCreate(BaseModel):
    name: str


class PhotographerUpdate(BaseModel):
    name: str


@router.get("")
async def get_photographers():
    """Get all photographers ordered by name."""
    try:
        result = supabase_db_instance.client.table("photographers").select("*").order("name").execute()
        return {"success": True, "data": result.data or []}
    except Exception as e:
        logger.error(f"[Photographers API] Error getting photographers: {e}")
        return {"success": False, "error": str(e), "data": []}


@router.get("/{photographer_id}")
async def get_photographer(photographer_id: str):
    """Get a photographer by ID."""
    try:
        result = supabase_db_instance.client.table("photographers").select("*").eq("id", photographer_id).execute()
        if result.data and len(result.data) > 0:
            return {"success": True, "data": result.data[0]}
        raise HTTPException(status_code=404, detail="Photographer not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Photographers API] Error getting photographer {photographer_id}: {e}")
        return {"success": False, "error": str(e)}


@router.post("")
async def create_photographer(data: PhotographerCreate):
    """Create a new photographer."""
    try:
        result = supabase_db_instance.client.table("photographers").insert({"name": data.name}).execute()
        if result.data:
            logger.info(f"[Photographers API] Created photographer: {data.name}")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        logger.error(f"[Photographers API] Error creating photographer: {e}")
        return {"success": False, "error": str(e)}


@router.put("/{photographer_id}")
async def update_photographer(photographer_id: str, data: PhotographerUpdate):
    """Update a photographer."""
    try:
        result = supabase_db_instance.client.table("photographers").update({"name": data.name}).eq("id", photographer_id).execute()
        if result.data:
            logger.info(f"[Photographers API] Updated photographer {photographer_id}: {data.name}")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        logger.error(f"[Photographers API] Error updating photographer {photographer_id}: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/{photographer_id}")
async def delete_photographer(photographer_id: str):
    """Delete a photographer."""
    try:
        supabase_db_instance.client.table("photographers").delete().eq("id", photographer_id).execute()
        logger.info(f"[Photographers API] Deleted photographer {photographer_id}")
        return {"success": True}
    except Exception as e:
        logger.error(f"[Photographers API] Error deleting photographer {photographer_id}: {e}")
        return {"success": False, "error": str(e)}
