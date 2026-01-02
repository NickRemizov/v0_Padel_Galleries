"""
Supabase People Repository - Person/player operations.

All methods are SYNC per ТЗ requirements.
"""

from typing import Optional, Dict, List

from core.logging import get_logger
from .base import get_supabase_client

logger = get_logger(__name__)


class PeopleRepository:
    """Repository for people-related database operations."""
    
    def __init__(self):
        self._client = None
    
    @property
    def client(self):
        if self._client is None:
            self._client = get_supabase_client()
        return self._client
    
    def get_person_info(self, person_id: str) -> Optional[Dict]:
        """
        Get person information by ID.
        
        Args:
            person_id: Person UUID
            
        Returns:
            Person dict or None if not found
        """
        try:
            response = self.client.table("people").select("*").eq("id", person_id).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
            
        except Exception as e:
            logger.error(f"[People] Error getting person info: {e}")
            return None
    
    def get_person_embeddings_for_audit(self, person_id: str) -> List[Dict]:
        """
        Get ALL embeddings for a person (including excluded) for audit.
        Used by outlier detection system.
        
        Args:
            person_id: Person UUID
            
        Returns:
            List of dicts with id, insightface_descriptor, excluded_from_index, 
            recognition_confidence, verified
        """
        logger.info(f"[People] Getting all embeddings for person {person_id}")
        
        try:
            response = self.client.table("photo_faces").select(
                "id, insightface_descriptor, excluded_from_index, recognition_confidence, verified"
            ).eq(
                "person_id", person_id
            ).not_.is_(
                "insightface_descriptor", "null"
            ).execute()
            
            if not response.data:
                return []
            
            logger.info(f"[People] Found {len(response.data)} embeddings for person")
            return response.data
            
        except Exception as e:
            logger.error(f"[People] Error getting person embeddings: {e}")
            return []
    
    def get_excluded_stats_by_person(self) -> List[Dict]:
        """
        Get exclusion statistics grouped by person.
        
        Returns:
            List of dicts with person_id, name, total_count, excluded_count
        """
        logger.info("[People] Getting excluded stats by person")
        
        try:
            # Try RPC first
            try:
                response = self.client.rpc("get_excluded_stats_by_person").execute()
                if response.data:
                    return response.data
            except Exception:
                pass  # RPC may not exist, fall back to manual aggregation
            
            # Fallback: manual aggregation with pagination
            all_faces = []
            page_size = 1000
            offset = 0

            while True:
                faces_response = self.client.table("photo_faces").select(
                    "person_id, excluded_from_index"
                ).not_.is_(
                    "person_id", "null"
                ).not_.is_(
                    "insightface_descriptor", "null"
                ).range(offset, offset + page_size - 1).execute()

                if not faces_response.data:
                    break

                all_faces.extend(faces_response.data)

                if len(faces_response.data) < page_size:
                    break

                offset += page_size

            if not all_faces:
                return []

            # Aggregate
            stats = {}
            for face in all_faces:
                pid = face["person_id"]
                if pid not in stats:
                    stats[pid] = {"total": 0, "excluded": 0}
                stats[pid]["total"] += 1
                if face.get("excluded_from_index"):
                    stats[pid]["excluded"] += 1
            
            # Get person names
            person_ids = list(stats.keys())
            people_response = self.client.table("people").select(
                "id, real_name, telegram_name"
            ).in_("id", person_ids).execute()
            
            names = {}
            for p in (people_response.data or []):
                names[p["id"]] = p.get("real_name") or p.get("telegram_name") or "Unknown"
            
            # Build result
            result = []
            for pid, counts in stats.items():
                if counts["excluded"] > 0:  # Only people with excluded faces
                    result.append({
                        "person_id": pid,
                        "name": names.get(pid, "Unknown"),
                        "total_count": counts["total"],
                        "excluded_count": counts["excluded"]
                    })
            
            return sorted(result, key=lambda x: x["excluded_count"], reverse=True)
            
        except Exception as e:
            logger.error(f"[People] Error getting excluded stats: {e}")
            return []


# Singleton instance
_people_repository: PeopleRepository = None


def get_people_repository() -> PeopleRepository:
    """Get shared PeopleRepository instance."""
    global _people_repository
    if _people_repository is None:
        _people_repository = PeopleRepository()
    return _people_repository
