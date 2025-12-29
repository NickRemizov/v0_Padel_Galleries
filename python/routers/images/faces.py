"""
Images Face Operations

Endpoints:
- GET /{image_id}/people - Get verified people on image
"""

from fastapi import APIRouter

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger

from .helpers import get_supabase_db

logger = get_logger(__name__)
router = APIRouter()


@router.get("/{image_id}/people")
async def get_image_verified_people(image_id: str):
    """Получает список верифицированных людей на фото."""
    supabase_db = get_supabase_db()
    
    try:
        logger.info(f"Getting verified people for image: {image_id}")
        
        result = supabase_db.client.table("photo_faces").select("person_id, people!inner(id, real_name, telegram_name)").eq("photo_id", image_id).eq("verified", True).execute()
        
        people = []
        for item in (result.data or []):
            person_data = item.get("people", {})
            name = person_data.get("real_name") or person_data.get("telegram_name") or "Unknown"
            people.append({
                "id": person_data.get("id"),
                "name": name
            })
        
        logger.info(f"Found {len(people)} verified people on image")
        return ApiResponse.ok(people)
        
    except Exception as e:
        logger.error(f"Error getting verified people: {e}")
        raise DatabaseError(str(e), operation="get_verified_people")
