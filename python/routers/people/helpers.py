"""
People API - Helper Functions
Shared utilities for people endpoints
"""

from typing import Optional, List

from core.exceptions import NotFoundError
from core.logging import get_logger
from core.slug import resolve_identifier

logger = get_logger(__name__)


def get_supabase_db():
    """Get supabase_db instance from package globals."""
    from . import supabase_db_instance
    return supabase_db_instance


def get_face_service():
    """Get face_service instance from package globals."""
    from . import face_service_instance
    return face_service_instance


def resolve_person(identifier: str) -> Optional[dict]:
    """Resolve person by ID or slug."""
    supabase_db = get_supabase_db()
    return resolve_identifier(
        supabase_db.client,
        "people",
        identifier,
        slug_column="slug"
    )


def get_person_id(identifier: str) -> str:
    """Get person ID from identifier (ID or slug). Raises NotFoundError if not found."""
    person = resolve_person(identifier)
    if not person:
        raise NotFoundError("Person", identifier)
    return person["id"]


def convert_bbox_to_array(bbox) -> Optional[List[float]]:
    """
    Convert bbox from various formats to [x1, y1, x2, y2] array.
    
    Supports:
    - Already array [x1, y1, x2, y2] -> return as is
    - Object {x, y, width, height} -> convert to [x, y, x+width, y+height]
    - None -> return None
    """
    if bbox is None:
        return None
    
    # Already an array
    if isinstance(bbox, list):
        if len(bbox) == 4:
            return [float(x) for x in bbox]
        return None
    
    # Object with x, y, width, height
    if isinstance(bbox, dict):
        try:
            x = float(bbox.get("x", 0))
            y = float(bbox.get("y", 0))
            width = float(bbox.get("width", 0))
            height = float(bbox.get("height", 0))
            return [x, y, x + width, y + height]
        except (TypeError, ValueError):
            return None
    
    return None


async def calculate_people_stats(people: list) -> list:
    """Calculate face statistics for all people.
    
    Counts:
    - verified_photos_count: photos where person is verified
    - high_confidence_photos_count: photos with high confidence (not verified)
    - descriptor_count: total photo_faces with embeddings for this person
    - excluded_count: descriptors excluded from index
    """
    supabase_db = get_supabase_db()
    
    try:
        config = supabase_db.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Load all photo_faces with their embedding status
        all_faces = []
        offset = 0
        page_size = 1000
        while True:
            faces_result = supabase_db.client.table("photo_faces").select(
                "person_id, photo_id, verified, recognition_confidence, excluded_from_index"
            ).not_.is_("insightface_descriptor", "null").range(offset, offset + page_size - 1).execute()
            
            batch = faces_result.data or []
            all_faces.extend(batch)
            
            if len(batch) < page_size:
                break
            offset += page_size
        
        logger.info(f"Loaded {len(all_faces)} photo_faces with embeddings for stats")
        
        # Count descriptors (faces with embeddings) per person
        descriptor_counts = {}
        excluded_counts = {}
        for f in all_faces:
            pid = f.get("person_id")
            if pid:
                descriptor_counts[pid] = descriptor_counts.get(pid, 0) + 1
                if f.get("excluded_from_index"):
                    excluded_counts[pid] = excluded_counts.get(pid, 0) + 1
        
        # Calculate stats for each person
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
                elif (face.get("recognition_confidence") or 0) >= confidence_threshold:
                    high_conf_photos.add(photo_id)
            
            # Remove from high_conf those already verified
            high_conf_photos -= verified_photos
            
            result.append({
                **person,
                "verified_photos_count": len(verified_photos),
                "high_confidence_photos_count": len(high_conf_photos),
                "descriptor_count": descriptor_counts.get(person_id, 0),
                "excluded_count": excluded_counts.get(person_id, 0)
            })
        
        return result
    except Exception as e:
        logger.error(f"Error calculating stats: {e}")
        return people
