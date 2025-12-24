"""
Supabase Training Repository - Training session and verified faces operations.

Extracted from supabase_client.py. Handles:
- Training sessions (create, update, get, history)
- Verified faces loading for training
- Co-occurring people analysis
- Face descriptor updates
"""

from typing import List, Dict, Optional
import numpy as np
import json

from core.logging import get_logger
from .base import get_supabase_client

logger = get_logger(__name__)


class TrainingRepository:
    """Repository for training operations."""
    
    def __init__(self):
        self._client = get_supabase_client()
    
    # ==================== Training Sessions ====================
    
    def create_training_session(self, session_data: Dict) -> str:
        """
        Create a training session record.
        
        Returns:
            session_id
        """
        try:
            response = self._client.table("face_training_sessions").insert(session_data).execute()
            session_id = response.data[0]["id"]
            logger.info(f"Created training session: {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"Error creating training session: {e}")
            raise
    
    def update_training_session(self, session_id: str, updates: Dict) -> bool:
        """Update a training session."""
        try:
            self._client.table("face_training_sessions").update(updates).eq("id", session_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error updating training session: {e}")
            return False
    
    def get_training_session(self, session_id: str) -> Optional[Dict]:
        """Get training session by ID."""
        try:
            response = self._client.table("face_training_sessions").select(
                "*"
            ).eq("id", session_id).execute()
            
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Error getting training session: {e}")
            return None
    
    def get_training_history(self, limit: int = 10, offset: int = 0) -> List[Dict]:
        """Get training history."""
        try:
            response = self._client.table("face_training_sessions").select(
                "*"
            ).order("created_at", desc=True).limit(limit).offset(offset).execute()
            
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting training history: {e}")
            return []
    
    def get_training_sessions_count(self) -> int:
        """Get total training sessions count."""
        try:
            response = self._client.table("face_training_sessions").select(
                "id", count="exact"
            ).execute()
            
            return response.count or 0
            
        except Exception as e:
            logger.error(f"Error getting training sessions count: {e}")
            return 0
    
    # ==================== Verified Faces ====================
    
    async def get_verified_faces(
        self,
        event_ids: Optional[List[str]] = None,
        person_ids: Optional[List[str]] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        min_faces_per_person: int = 3
    ) -> List[Dict]:
        """
        Get verified faces with filters.
        
        Returns:
            List of face data dicts
        """
        try:
            query = self._client.table("photo_faces").select(
                "id, person_id, insightface_bbox, photo_id, "
                "people(id, real_name), "
                "gallery_images(id, image_url, gallery_id, galleries(id, title, shoot_date))"
            ).eq("verified", True).not_.is_("person_id", "null")
            
            if person_ids:
                query = query.in_("person_id", person_ids)
            
            response = query.execute()
            faces_data = response.data or []
            
            # Filter and transform
            filtered = self._filter_faces(faces_data, event_ids, date_from, date_to)
            
            # Group by person and filter by min count
            return self._filter_by_min_faces(filtered, min_faces_per_person)
            
        except Exception as e:
            logger.error(f"Error getting verified faces: {e}")
            raise
    
    async def get_verified_faces_with_descriptors(
        self,
        event_ids: Optional[List[str]] = None,
        person_ids: Optional[List[str]] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        min_faces_per_person: int = 3
    ) -> List[Dict]:
        """
        Get verified faces with descriptors.
        
        Returns:
            List of face data dicts including insightface_descriptor
        """
        try:
            query = self._client.table("photo_faces").select(
                "id, person_id, insightface_bbox, photo_id, insightface_descriptor, "
                "people(id, real_name), "
                "gallery_images(id, image_url, gallery_id, galleries(id, title, shoot_date))"
            ).eq("verified", True).not_.is_("person_id", "null")
            
            if person_ids:
                query = query.in_("person_id", person_ids)
            
            response = query.execute()
            faces_data = response.data or []
            
            # Filter and transform (include descriptor)
            filtered = self._filter_faces(faces_data, event_ids, date_from, date_to, include_descriptor=True)
            
            # Group by person and filter by min count
            return self._filter_by_min_faces(filtered, min_faces_per_person)
            
        except Exception as e:
            logger.error(f"Error getting verified faces with descriptors: {e}")
            raise
    
    def _filter_faces(
        self,
        faces_data: List[Dict],
        event_ids: Optional[List[str]],
        date_from: Optional[str],
        date_to: Optional[str],
        include_descriptor: bool = False
    ) -> List[Dict]:
        """Filter and transform faces data."""
        filtered = []
        
        for face in faces_data:
            photo = face.get("gallery_images")
            if not photo:
                continue
            
            gallery = photo.get("galleries")
            
            # Filter by event_ids
            if event_ids and photo.get("gallery_id") not in event_ids:
                continue
            
            # Filter by dates
            if gallery:
                shoot_date = gallery.get("shoot_date")
                if date_from and shoot_date and shoot_date < date_from:
                    continue
                if date_to and shoot_date and shoot_date > date_to:
                    continue
            
            person = face.get("people")
            
            # Parse bbox
            bbox = face.get("insightface_bbox")
            if isinstance(bbox, str):
                bbox = json.loads(bbox)
            
            result = {
                "face_id": face["id"],
                "person_id": face["person_id"],
                "person_name": person.get("real_name") if person else "Unknown",
                "photo_id": face["photo_id"],
                "photo_url": photo["image_url"],
                "bbox": bbox,
                "gallery_id": photo.get("gallery_id"),
                "gallery_name": gallery.get("title") if gallery else None,
                "gallery_date": gallery.get("shoot_date") if gallery else None
            }
            
            if include_descriptor:
                result["insightface_descriptor"] = face.get("insightface_descriptor")
            
            filtered.append(result)
        
        return filtered
    
    def _filter_by_min_faces(self, faces: List[Dict], min_count: int) -> List[Dict]:
        """Filter out people with too few faces."""
        person_faces = {}
        for face in faces:
            pid = face["person_id"]
            if pid not in person_faces:
                person_faces[pid] = []
            person_faces[pid].append(face)
        
        result = []
        for pid, pfaces in person_faces.items():
            if len(pfaces) >= min_count:
                result.extend(pfaces)
        
        logger.info(f"Found {len(result)} verified faces from {len(person_faces)} people")
        return result
    
    # ==================== Co-occurring People ====================
    
    async def get_co_occurring_people(self, event_ids: List[str]) -> Dict[str, List[str]]:
        """
        Get people who often appear together in events.
        
        Returns:
            Dict mapping person_id to list of co-occurring person_ids
        """
        try:
            response = self._client.table("photo_faces").select(
                "person_id, photo_id, gallery_images(gallery_id)"
            ).eq("verified", True).not_.is_("person_id", "null").execute()
            
            faces_data = response.data or []
            
            # Filter by event_ids
            filtered = [
                f for f in faces_data
                if f.get("gallery_images") and f["gallery_images"].get("gallery_id") in event_ids
            ]
            
            # Group by photo
            photo_people = {}
            for face in filtered:
                photo_id = face["photo_id"]
                person_id = face["person_id"]
                
                if photo_id not in photo_people:
                    photo_people[photo_id] = set()
                photo_people[photo_id].add(person_id)
            
            # Build co-occurrence
            co_occurring = {}
            for people_set in photo_people.values():
                for person_id in people_set:
                    if person_id not in co_occurring:
                        co_occurring[person_id] = []
                    co_occurring[person_id].extend(
                        p for p in people_set if p != person_id
                    )
            
            # Count and keep top 10
            from collections import Counter
            result = {}
            for person_id, co_list in co_occurring.items():
                counter = Counter(co_list)
                result[person_id] = [pid for pid, _ in counter.most_common(10)]
            
            logger.info(f"Found co-occurring people for {len(result)} people")
            return result
            
        except Exception as e:
            logger.error(f"Error getting co-occurring people: {e}")
            return {}
    
    # ==================== Face Descriptor Updates ====================
    
    async def update_face_descriptor(
        self,
        face_id: str,
        descriptor: np.ndarray,
        det_score: float,
        bbox: Dict,
        training_context: Dict
    ) -> bool:
        """
        Update face descriptor and related fields.
        
        Returns:
            True if successful
        """
        try:
            # Convert numpy types to Python types
            descriptor_list = descriptor.tolist() if isinstance(descriptor, np.ndarray) else descriptor
            det_score_float = float(det_score)
            
            bbox_clean = {}
            for key, value in bbox.items():
                if isinstance(value, (np.integer, np.floating)):
                    bbox_clean[key] = float(value)
                else:
                    bbox_clean[key] = value
            
            context_clean = {}
            for key, value in training_context.items():
                if isinstance(value, (np.integer, np.floating)):
                    context_clean[key] = float(value)
                elif isinstance(value, np.ndarray):
                    context_clean[key] = value.tolist()
                else:
                    context_clean[key] = value
            
            self._client.table("photo_faces").update({
                "insightface_descriptor": descriptor_list,
                "insightface_det_score": det_score_float,
                "insightface_bbox": bbox_clean,
                "training_used": True,
                "training_context": context_clean
            }).eq("id", face_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating face descriptor: {e}")
            return False


# Module-level instance
_training_repo: TrainingRepository = None


def get_training_repository() -> TrainingRepository:
    """Get TrainingRepository singleton."""
    global _training_repo
    if _training_repo is None:
        _training_repo = TrainingRepository()
    return _training_repo
