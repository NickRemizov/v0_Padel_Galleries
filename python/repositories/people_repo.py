"""
People repository - handles people table operations.
"""

from typing import Optional, List, Dict, Any

from repositories.base import BaseRepository
from models.domain.person import Person, PersonSummary
from core.exceptions import PersonNotFoundError
from core.logging import get_logger

logger = get_logger(__name__)


class PeopleRepository(BaseRepository):
    """
    Repository for people table.
    """
    
    table_name = "people"
    model_class = Person
    
    # ============================================================
    # Query Methods
    # ============================================================
    
    async def get_by_telegram_id(self, telegram_id: str) -> Optional[Person]:
        """
        Find person by Telegram ID.
        """
        try:
            response = (
                self.table
                .select("*")
                .eq("telegram_id", telegram_id)
                .execute()
            )
            
            if not response.data:
                return None
            
            return self._to_model(response.data[0])
            
        except Exception as e:
            self._handle_error("get_by_telegram_id", e)
    
    async def search_by_name(self, query: str, limit: int = 20) -> List[Person]:
        """
        Search people by name.
        """
        try:
            response = (
                self.table
                .select("*")
                .or_(f"real_name.ilike.%{query}%,telegram_full_name.ilike.%{query}%")
                .limit(limit)
                .execute()
            )
            
            return [self._to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("search_by_name", e)
    
    async def get_with_stats(self, person_id: str) -> Optional[Dict]:
        """
        Get person with face/photo statistics.
        """
        try:
            # Get person
            person = await self.get_by_id(person_id)
            if not person:
                return None
            
            # Count verified faces
            faces_response = (
                self.client.client.table("photo_faces")
                .select("id", count="exact")
                .eq("person_id", person_id)
                .eq("verified", True)
                .execute()
            )
            
            # Count total faces
            total_response = (
                self.client.client.table("photo_faces")
                .select("id", count="exact")
                .eq("person_id", person_id)
                .execute()
            )
            
            return {
                "person": person,
                "verified_faces_count": faces_response.count or 0,
                "total_faces_count": total_response.count or 0
            }
            
        except Exception as e:
            self._handle_error("get_with_stats", e)
    
    async def get_co_occurring(
        self,
        person_id: str,
        gallery_ids: List[str] = None,
        limit: int = 10
    ) -> List[PersonSummary]:
        """
        Get people who frequently appear with this person.
        """
        try:
            # Get photos with this person
            photos_response = (
                self.client.client.table("photo_faces")
                .select("photo_id")
                .eq("person_id", person_id)
                .execute()
            )
            
            if not photos_response.data:
                return []
            
            photo_ids = [p["photo_id"] for p in photos_response.data]
            
            # Get other people in same photos
            others_response = (
                self.client.client.table("photo_faces")
                .select("person_id")
                .in_("photo_id", photo_ids)
                .not_.is_("person_id", "null")
                .neq("person_id", person_id)
                .execute()
            )
            
            # Count occurrences
            from collections import Counter
            counts = Counter(p["person_id"] for p in others_response.data)
            top_ids = [pid for pid, _ in counts.most_common(limit)]
            
            if not top_ids:
                return []
            
            # Get person details
            people_response = (
                self.table
                .select("id, real_name, telegram_full_name, avatar_url")
                .in_("id", top_ids)
                .execute()
            )
            
            return [
                PersonSummary(
                    id=p["id"],
                    name=p.get("real_name") or p.get("telegram_full_name") or "Unknown",
                    avatar_url=p.get("avatar_url")
                )
                for p in people_response.data
            ]
            
        except Exception as e:
            self._handle_error("get_co_occurring", e)
    
    async def get_without_avatar(self, limit: int = 50) -> List[PersonSummary]:
        """
        Get people without avatar.
        """
        try:
            response = (
                self.table
                .select("id, real_name, telegram_full_name")
                .is_("avatar_url", "null")
                .limit(limit)
                .execute()
            )
            
            return [
                PersonSummary(
                    id=p["id"],
                    name=p.get("real_name") or p.get("telegram_full_name") or "Unknown",
                    avatar_url=None
                )
                for p in response.data
            ]
            
        except Exception as e:
            self._handle_error("get_without_avatar", e)
    
    # ============================================================
    # Model Conversion
    # ============================================================
    
    def _to_model(self, data: Dict) -> Person:
        """
        Convert database row to Person model.
        """
        return Person(
            id=data["id"],
            real_name=data.get("real_name"),
            telegram_full_name=data.get("telegram_full_name"),
            telegram_id=data.get("telegram_id"),
            email=data.get("email"),
            avatar_url=data.get("avatar_url"),
            bio=data.get("bio"),
            instagram=data.get("instagram"),
            photos_count=data.get("photos_count", 0),
            verified_faces_count=data.get("verified_faces_count", 0),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at")
        )
