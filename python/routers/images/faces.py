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
async def get_image_linked_people(image_id: str):
    """Получает список людей, привязанных к фото (verified или распознанных).

    Privacy settings:
    - show_name_on_photos=false -> don't include person at all
    - create_personal_gallery=false -> include but with hasGallery=false (link inactive)
    """
    supabase_db = get_supabase_db()

    try:
        logger.info(f"Getting linked people for image: {image_id}")

        # Get all faces with person_id (not just verified)
        result = supabase_db.client.table("photo_faces").select(
            "person_id, people!inner(id, slug, real_name, telegram_full_name, show_name_on_photos, create_personal_gallery)"
        ).eq("photo_id", image_id).execute()

        people = []
        seen_person_ids = set()
        for item in (result.data or []):
            person_data = item.get("people", {})
            person_id = person_data.get("id")

            # Skip duplicates (same person on multiple faces)
            if person_id in seen_person_ids:
                continue
            seen_person_ids.add(person_id)

            # Skip if show_name_on_photos is false
            if not person_data.get("show_name_on_photos", True):
                continue

            name = person_data.get("real_name") or person_data.get("telegram_full_name") or "Unknown"
            people.append({
                "id": person_id,
                "slug": person_data.get("slug"),
                "name": name,
                "hasGallery": person_data.get("create_personal_gallery", True)
            })

        logger.info(f"Found {len(people)} linked people on image")
        return ApiResponse.ok(people)
        
    except Exception as e:
        logger.error(f"Error getting verified people: {e}")
        raise DatabaseError(str(e), operation="get_verified_people")
