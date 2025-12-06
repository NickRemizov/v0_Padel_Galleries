from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

supabase_db_instance: SupabaseDatabase = None
face_service_instance: FaceRecognitionService = None

def set_services(supabase_db: SupabaseDatabase, face_service: FaceRecognitionService):
    global supabase_db_instance, face_service_instance
    supabase_db_instance = supabase_db
    face_service_instance = face_service


class PersonCreate(BaseModel):
    real_name: str
    telegram_name: Optional[str] = None
    telegram_nickname: Optional[str] = None
    telegram_profile_url: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[int] = None
    avatar_url: Optional[str] = None
    show_in_players_gallery: bool = True
    show_photos_in_galleries: bool = True

class PersonUpdate(BaseModel):
    real_name: Optional[str] = None
    telegram_name: Optional[str] = None
    telegram_nickname: Optional[str] = None
    telegram_profile_url: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[int] = None
    avatar_url: Optional[str] = None
    show_in_players_gallery: Optional[bool] = None
    show_photos_in_galleries: Optional[bool] = None

class VisibilityUpdate(BaseModel):
    show_in_players_gallery: Optional[bool] = None
    show_photos_in_galleries: Optional[bool] = None


@router.get("")
async def get_people(with_stats: bool = Query(False)):
    """Get all people, optionally with face stats."""
    try:
        result = supabase_db_instance.client.table("people").select("*").order("real_name").execute()
        people = result.data or []
        
        if not with_stats:
            return {"success": True, "data": people}
        
        # Calculate stats
        people_with_stats = await _calculate_people_stats(people)
        return {"success": True, "data": people_with_stats}
    except Exception as e:
        logger.error(f"[People API] Error: {e}")
        return {"success": False, "error": str(e), "data": []}


@router.get("/{person_id}")
async def get_person(person_id: str):
    """Get a person by ID."""
    try:
        result = supabase_db_instance.client.table("people").select("*").eq("id", person_id).execute()
        if result.data and len(result.data) > 0:
            return {"success": True, "data": result.data[0]}
        raise HTTPException(status_code=404, detail="Person not found")
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/{person_id}/photos")
async def get_person_photos(person_id: str):
    """Get all photos containing this person."""
    try:
        result = supabase_db_instance.client.table("photo_faces").select(
            "id, photo_id, verified, recognition_confidence, gallery_images!inner(id, image_url, original_filename, gallery_id)"
        ).eq("person_id", person_id).or_("verified.eq.true,recognition_confidence.gte.0.6").execute()
        return {"success": True, "data": result.data or []}
    except Exception as e:
        logger.error(f"[People API] Error getting photos: {e}")
        return {"success": False, "error": str(e), "data": []}


@router.post("")
async def create_person(data: PersonCreate):
    """Create a new person."""
    try:
        insert_data = data.model_dump(exclude_none=True)
        result = supabase_db_instance.client.table("people").insert(insert_data).execute()
        if result.data:
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.put("/{person_id}")
async def update_person(person_id: str, data: PersonUpdate):
    """Update a person."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            return {"success": False, "error": "No fields to update"}
        result = supabase_db_instance.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.patch("/{person_id}/avatar")
async def update_avatar(person_id: str, avatar_url: str = Query(...)):
    """Update person's avatar."""
    try:
        result = supabase_db_instance.client.table("people").update({"avatar_url": avatar_url}).eq("id", person_id).execute()
        if result.data:
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.patch("/{person_id}/visibility")
async def update_visibility(person_id: str, data: VisibilityUpdate):
    """Update person's visibility settings."""
    try:
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            return {"success": False, "error": "No fields to update"}
        result = supabase_db_instance.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            return {"success": True, "data": result.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/{person_id}")
async def delete_person(person_id: str):
    """Delete a person and cleanup related data."""
    try:
        # Delete face descriptors
        supabase_db_instance.client.table("face_descriptors").delete().eq("person_id", person_id).execute()
        
        # Unlink photo_faces
        supabase_db_instance.client.table("photo_faces").update(
            {"person_id": None, "verified": False}
        ).eq("person_id", person_id).execute()
        
        # Delete person
        supabase_db_instance.client.table("people").delete().eq("id", person_id).execute()
        
        # Rebuild index
        if face_service_instance:
            await face_service_instance.rebuild_players_index()
        
        return {"success": True, "index_rebuilt": True}
    except Exception as e:
        logger.error(f"[People API] Error deleting: {e}")
        return {"success": False, "error": str(e)}


async def _calculate_people_stats(people: list) -> list:
    """Calculate face statistics for all people."""
    try:
        faces_result = supabase_db_instance.client.table("photo_faces").select(
            "person_id, photo_id, verified, recognition_confidence"
        ).execute()
        all_faces = faces_result.data or []
        
        descriptors_result = supabase_db_instance.client.table("face_descriptors").select("person_id").execute()
        all_descriptors = descriptors_result.data or []
        
        descriptor_counts = {}
        for d in all_descriptors:
            pid = d.get("person_id")
            if pid:
                descriptor_counts[pid] = descriptor_counts.get(pid, 0) + 1
        
        result = []
        for person in people:
            person_id = person["id"]
            person_faces = [f for f in all_faces if f.get("person_id") == person_id]
            
            verified_photos = set()
            high_conf_photos = set()
            
            for face in person_faces:
                photo_id = face.get("photo_id")
                if face.get("verified"):
                    verified_photos.add(photo_id)
                elif (face.get("recognition_confidence") or 0) >= 0.6:
                    high_conf_photos.add(photo_id)
            
            high_conf_photos -= verified_photos
            
            result.append({
                **person,
                "verified_photos_count": len(verified_photos),
                "high_confidence_photos_count": len(high_conf_photos),
                "descriptor_count": descriptor_counts.get(person_id, 0)
            })
        
        return result
    except Exception as e:
        logger.error(f"[People API] Error calculating stats: {e}")
        return people
