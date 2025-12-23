"""
Admin API - Helper Functions
Shared utilities for admin endpoints
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from core.logging import get_logger

logger = get_logger(__name__)


def format_short_date(date_str: Optional[str]) -> str:
    """Format date as DD.MM"""
    if not date_str:
        return ""
    try:
        date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return f"{date.day:02d}.{date.month:02d}"
    except:
        return ""


def generate_dynamic_thresholds(max_photos: int) -> List[int]:
    """Generate threshold values for distribution analysis"""
    thresholds = [1, 3, 5, 10]
    threshold = 15
    while threshold <= max_photos:
        thresholds.append(threshold)
        threshold += 5
    return thresholds


def generate_dynamic_histogram_buckets(max_photos: int) -> List[Dict[str, Any]]:
    """Generate histogram bucket definitions"""
    buckets = [
        {"range": "1-2", "min": 1, "max": 2},
        {"range": "3-4", "min": 3, "max": 4},
        {"range": "5-9", "min": 5, "max": 9},
        {"range": "10-14", "min": 10, "max": 14},
    ]
    
    start = 15
    while start <= max_photos:
        end = start + 4
        if end >= max_photos and start <= max_photos:
            buckets.append({"range": f"{start}+", "min": start, "max": 9999})
            break
        else:
            buckets.append({"range": f"{start}-{end}", "min": start, "max": end})
        start += 5
    
    return buckets


async def load_all_photo_faces(client, select_fields: str, filters: Optional[Dict] = None) -> List[Dict]:
    """Load all photo_faces records with pagination (Supabase limit is 1000)"""
    all_records = []
    offset = 0
    page_size = 1000
    
    while True:
        query = client.table("photo_faces").select(select_fields).range(offset, offset + page_size - 1)
        
        if filters:
            for key, value in filters.items():
                if value is None:
                    query = query.is_(key, "null")
                elif isinstance(value, dict):
                    if "neq" in value:
                        neq_value = value["neq"]
                        if neq_value is None:
                            # For "not null" comparisons, use not_.is_() instead of neq()
                            query = query.not_.is_(key, "null")
                        else:
                            query = query.neq(key, neq_value)
                    elif "eq" in value:
                        query = query.eq(key, value["eq"])
                else:
                    query = query.eq(key, value)
        
        result = query.execute()
        batch = result.data if result.data else []
        
        if not batch:
            break
        all_records.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    
    return all_records


async def get_confidence_threshold(client) -> float:
    """Get confidence threshold from settings"""
    try:
        result = client.table("face_recognition_config").select("value").eq("key", "recognition_settings").single().execute()
        if result.data and result.data.get("value", {}).get("confidence_thresholds", {}).get("high_data"):
            return result.data["value"]["confidence_thresholds"]["high_data"]
    except Exception as e:
        logger.warning(f"Failed to get confidence threshold: {e}")
    return 0.6  # fallback


def count_faces_for_gallery(image_ids: List[str], all_photo_faces: List[Dict]) -> Dict[str, int]:
    """Count faces by category for a gallery"""
    gallery_faces = [f for f in all_photo_faces if f.get("photo_id") in image_ids]
    verified = len([f for f in gallery_faces if f.get("person_id") and f.get("recognition_confidence") == 1])
    unverified = len([f for f in gallery_faces if f.get("person_id") and f.get("recognition_confidence") is not None and f.get("recognition_confidence") < 1])
    unknown = len([f for f in gallery_faces if f.get("person_id") is None])
    return {"verified": verified, "unverified": unverified, "unknown": unknown}
