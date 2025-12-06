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


class OrganizerCreate(BaseModel):
    name: str


class OrganizerUpdate(BaseModel):
    name: str


@router.get("")
async def get_organizers():
    """Get all organizers ordered by name."""
    try:
        result = supabase_db_instance.client.table("organizers").select("*").order("name").execute()
        return {"success": True, "data": result.data or []}
    except Exception as e:
        logger.error(f"[Organizers API] Error getting organizers: {e}")
        return {"success": False, "error": str(e), "data": []}


@router.get("/{organizer_id}")
async def get_organizer(organizer_id: str):
    """Get an organizer by ID."""
    try:
        result = supabase_db_instance.client.table("organizers").select("*").eq("id", organizer_id).execute()
        if result.data and len(result.data) > 0:
            return {"success": True, "data": result.data[0]}
        raise HTTPException(status_code=404, detail="Organizer not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Organizers API] Error getting organizer {organizer_id}: {e}")
        return {"success": False, "error": str(e)}


@router.post("")
async def create_organizer(data: OrganizerCreate):
    """Create a new organizer."""
    try:
        result = supabase_db_instance.client.table("organizers").insert({"name": data.name}).execute()
        if result.data:
            logger.info(f"[Organizers API] Created organizer: {data.name}")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        logger.error(f"[Organizers API] Error creating organizer: {e}")
        return {"success": False, "error": str(e)}


@router.put("/{organizer_id}")
async def update_organizer(organizer_id: str, data: OrganizerUpdate):
    """Update an organizer."""
    try:
        result = supabase_db_instance.client.table("organizers").update({"name": data.name}).eq("id", organizer_id).execute()
        if result.data:
            logger.info(f"[Organizers API] Updated organizer {organizer_id}: {data.name}")
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        logger.error(f"[Organizers API] Error updating organizer {organizer_id}: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/{organizer_id}")
async def delete_organizer(organizer_id: str):
    """Delete an organizer."""
    try:
        supabase_db_instance.client.table("organizers").delete().eq("id", organizer_id).execute()
        logger.info(f"[Organizers API] Deleted organizer {organizer_id}")
        return {"success": True}
    except Exception as e:
        logger.error(f"[Organizers API] Error deleting organizer {organizer_id}: {e}")
        return {"success": False, "error": str(e)}
