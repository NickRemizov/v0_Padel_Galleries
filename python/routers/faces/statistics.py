"""
Faces API - Statistics
Statistics endpoint for admin panel
v2.1: Added pagination for photo_faces query
"""

from fastapi import APIRouter, Depends
from typing import Optional

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)
router = APIRouter()


def get_supabase_db():
    from . import supabase_db_instance
    return supabase_db_instance


@router.get("/statistics")
async def get_face_statistics(
    confidence_threshold: Optional[float] = None,
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """Get face recognition statistics for admin panel."""
    try:
        logger.info(f"Getting face statistics")
        
        config = supabase_db.get_recognition_config()
        threshold = confidence_threshold or config.get('recognition_threshold', 0.60)
        
        people_response = supabase_db.client.table("people").select("id", count="exact").execute()
        people_data = people_response.data or []
        total_people = people_response.count or 0
        
        # v2.1: Load ALL faces with pagination
        faces = []
        offset = 0
        page_size = 1000
        
        while True:
            faces_response = supabase_db.client.table("photo_faces").select(
                "id, photo_id, person_id, verified, confidence"
            ).range(offset, offset + page_size - 1).execute()
            
            batch = faces_response.data or []
            if not batch:
                break
            
            faces.extend(batch)
            
            if len(batch) < page_size:
                break
            offset += page_size
        
        logger.info(f"[v2.1] Loaded {len(faces)} faces with pagination")
        
        verified_count = len([f for f in faces if f.get("verified")])
        high_conf_count = len([
            f for f in faces 
            if f.get("confidence", 0) >= threshold and not f.get("verified")
        ])
        
        faces_by_person = {}
        for face in faces:
            person_id = face.get("person_id")
            if person_id:
                if person_id not in faces_by_person:
                    faces_by_person[person_id] = []
                faces_by_person[person_id].append(face)
        
        people_stats = []
        for person in people_data:
            person_id = person["id"]
            person_faces = faces_by_person.get(person_id, [])
            
            verified_photo_ids = set(
                f["photo_id"] for f in person_faces if f.get("verified")
            )
            high_conf_photo_ids = set(
                f["photo_id"] for f in person_faces 
                if f.get("confidence", 0) >= threshold and not f.get("verified")
            )
            
            total_confirmed = len(verified_photo_ids) + len(high_conf_photo_ids)
            
            people_stats.append({
                "id": person_id,
                "verifiedPhotos": len(verified_photo_ids),
                "highConfidencePhotos": len(high_conf_photo_ids),
                "totalConfirmed": total_confirmed,
            })
        
        people_stats.sort(key=lambda x: x["totalConfirmed"], reverse=True)
        
        logger.info(f"Statistics: {total_people} people, {verified_count} verified, {high_conf_count} high-conf")
        
        return ApiResponse.ok({
            "summary": {
                "totalPeople": total_people,
                "totalVerifiedFaces": verified_count,
                "totalHighConfidenceFaces": high_conf_count,
            },
            "peopleStats": people_stats,
        })
        
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        raise DatabaseError(str(e), operation="get_face_statistics")
