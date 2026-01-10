"""
Supabase Service Package - Unified data access layer.

Refactored from monolithic supabase_client.py and supabase_database.py.

Usage:
    from services.supabase import SupabaseService
    
    db = SupabaseService()
    config = db.config.get_recognition_config()
    embeddings = db.embeddings.get_all_player_embeddings()
    faces = db.faces.get_unknown_faces_from_gallery(gallery_id)
    person = db.people.get_person_info(person_id)

For backward compatibility:
    from services.supabase import get_supabase_client
    client = get_supabase_client()  # raw Supabase client

v4.1: Added backward compatibility methods for legacy routers
"""

from typing import List, Dict, Optional, Tuple
import numpy as np

from .base import SupabaseBase, get_supabase_client, get_supabase_base
from .config import ConfigRepository, get_config_repository, get_recognition_config
from .embeddings import EmbeddingsRepository, get_embeddings_repository
from .training import TrainingRepository, get_training_repository
from .faces import FacesRepository, get_faces_repository
from .people import PeopleRepository, get_people_repository

from core.logging import get_logger

logger = get_logger(__name__)


class SupabaseService:
    """
    Unified facade for all Supabase operations.
    
    Provides structured access to repositories:
    - config: Recognition configuration
    - embeddings: HNSW index embeddings
    - training: Training sessions and verified faces
    - faces: Face operations (unknown faces, rejection, recognition results)
    - people: Person/player operations
    
    Also provides backward compatibility via .client property and legacy method aliases.
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._base = get_supabase_base()
        self._config = None
        self._embeddings = None
        self._training = None
        self._faces = None
        self._people = None
        self._initialized = True
        
        logger.info("SupabaseService initialized")
    
    @property
    def client(self):
        """Raw Supabase client for backward compatibility."""
        return self._base.client
    
    @property
    def config(self) -> ConfigRepository:
        """Configuration repository."""
        if self._config is None:
            self._config = get_config_repository()
        return self._config
    
    @property
    def embeddings(self) -> EmbeddingsRepository:
        """Embeddings repository."""
        if self._embeddings is None:
            self._embeddings = get_embeddings_repository()
        return self._embeddings
    
    @property
    def training(self) -> TrainingRepository:
        """Training repository."""
        if self._training is None:
            self._training = get_training_repository()
        return self._training
    
    @property
    def faces(self) -> FacesRepository:
        """Faces repository."""
        if self._faces is None:
            self._faces = get_faces_repository()
        return self._faces
    
    @property
    def people(self) -> PeopleRepository:
        """People repository."""
        if self._people is None:
            self._people = get_people_repository()
        return self._people
    
    # =========================================================================
    # BACKWARD COMPATIBILITY: Legacy SupabaseDatabase methods
    # These delegate to the appropriate repository
    # =========================================================================
    
    def get_all_player_embeddings(self) -> Tuple[List[str], List[np.ndarray], List[bool], List[float]]:
        """Legacy: Delegate to embeddings repository."""
        return self.embeddings.get_all_player_embeddings()
    
    def get_recognition_config(self) -> Dict:
        """Legacy: Delegate to config repository."""
        return self.config.get_recognition_config()
    
    def get_recognition_config_sync(self) -> Dict:
        """Legacy: Delegate to config repository (sync)."""
        return self.config.get_recognition_config()
    
    def get_person_info(self, person_id: str) -> Optional[Dict]:
        """Legacy: Delegate to people repository."""
        return self.people.get_person_info(person_id)
    
    def get_person_embeddings_for_audit(self, person_id: str) -> List[Dict]:
        """Legacy: Delegate to people repository."""
        return self.people.get_person_embeddings_for_audit(person_id)
    
    def get_unknown_faces_from_gallery(self, gallery_id: str) -> List[Dict]:
        """Legacy: Delegate to faces repository."""
        return self.faces.get_unknown_faces_from_gallery(gallery_id)
    
    def get_all_unknown_faces(self) -> List[Dict]:
        """Legacy: Delegate to faces repository."""
        return self.faces.get_all_unknown_faces()
    
    def set_excluded_from_index(self, face_ids: List[str], excluded: bool = True) -> int:
        """Legacy: Delegate to embeddings repository."""
        return self.embeddings.set_excluded_from_index(face_ids, excluded)
    
    def get_excluded_stats_by_person(self) -> List[Dict]:
        """Legacy: Delegate to embeddings repository."""
        return self.embeddings.get_excluded_stats_by_person()
    
    def is_face_rejected(self, embedding: np.ndarray, similarity_threshold: float = 0.85) -> bool:
        """Legacy: Delegate to faces repository."""
        return self.faces.is_face_rejected(embedding, similarity_threshold)
    
    def reject_face_cluster(
        self,
        descriptors: List[np.ndarray],
        gallery_id: str,
        photo_ids: List[str],
        rejected_by: str,
        reason: str = None
    ) -> bool:
        """Legacy: Delegate to faces repository."""
        return self.faces.reject_face_cluster(descriptors, gallery_id, photo_ids, rejected_by, reason)
    
    def update_recognition_result(
        self,
        face_id: str,
        person_id: Optional[str],
        recognition_confidence: float,
        verified: bool = False,
        verified_by: Optional[str] = None
    ) -> bool:
        """Legacy: Delegate to faces repository."""
        return self.faces.update_recognition_result(
            face_id, person_id, recognition_confidence, verified, verified_by
        )
    
    # =========================================================================
    # BACKWARD COMPATIBILITY: Legacy SupabaseClient methods
    # =========================================================================
    
    def get_config(self) -> Dict:
        """Legacy: Delegate to config repository."""
        return self.config.get_raw_config()
    
    def update_config(self, key: str, value: Dict) -> bool:
        """Legacy: Delegate to config repository."""
        return self.config.update_config(key, value)
    
    def update_recognition_config(self, settings: Dict) -> bool:
        """Legacy: Delegate to config repository."""
        return self.config.update_recognition_config(settings)
    
    def create_training_session(self, session_data: Dict) -> str:
        """Legacy: Delegate to training repository."""
        return self.training.create_training_session(session_data)
    
    def update_training_session(self, session_id: str, updates: Dict) -> bool:
        """Legacy: Delegate to training repository."""
        return self.training.update_training_session(session_id, updates)
    
    def get_training_session(self, session_id: str) -> Optional[Dict]:
        """Legacy: Delegate to training repository."""
        return self.training.get_training_session(session_id)
    
    def get_training_history(self, limit: int = 10, offset: int = 0) -> List[Dict]:
        """Legacy: Delegate to training repository."""
        return self.training.get_training_history(limit, offset)
    
    def get_training_sessions_count(self) -> int:
        """Legacy: Delegate to training repository."""
        return self.training.get_training_sessions_count()
    
    async def get_verified_faces(self, **kwargs) -> List[Dict]:
        """Legacy: Delegate to training repository."""
        return await self.training.get_verified_faces(**kwargs)
    
    async def get_verified_faces_with_descriptors(self, **kwargs) -> List[Dict]:
        """Legacy: Delegate to training repository."""
        return await self.training.get_verified_faces_with_descriptors(**kwargs)
    
    async def get_co_occurring_people(self, event_ids: List[str]) -> Dict[str, List[str]]:
        """Legacy: Delegate to training repository."""
        return await self.training.get_co_occurring_people(event_ids)
    
    async def update_face_descriptor(
        self,
        face_id: str,
        descriptor: np.ndarray,
        det_score: float,
        bbox: Dict
    ) -> bool:
        """Legacy: Delegate to training repository."""
        return await self.training.update_face_descriptor(
            face_id, descriptor, det_score, bbox
        )


# Global instance
_service_instance: SupabaseService = None


def get_supabase_service() -> SupabaseService:
    """Get SupabaseService singleton."""
    global _service_instance
    if _service_instance is None:
        _service_instance = SupabaseService()
    return _service_instance


# Exports
__all__ = [
    # Main facade
    "SupabaseService",
    "get_supabase_service",
    
    # Base client (backward compatibility)
    "SupabaseBase",
    "get_supabase_client",
    
    # Repositories
    "ConfigRepository",
    "EmbeddingsRepository", 
    "TrainingRepository",
    "FacesRepository",
    "PeopleRepository",
    
    # Convenience functions
    "get_config_repository",
    "get_embeddings_repository",
    "get_training_repository",
    "get_faces_repository",
    "get_people_repository",
    "get_recognition_config",
]
