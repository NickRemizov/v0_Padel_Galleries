"""
Supabase Service Package - Unified data access layer.

Refactored from monolithic supabase_client.py and supabase_database.py.

Usage:
    from services.supabase import SupabaseService
    
    db = SupabaseService()
    config = db.config.get_recognition_config()
    embeddings = db.embeddings.get_all_player_embeddings()

For backward compatibility:
    from services.supabase import get_supabase_client
    client = get_supabase_client()  # raw Supabase client
"""

from .base import SupabaseBase, get_supabase_client, get_supabase_base
from .config import ConfigRepository, get_config_repository, get_recognition_config
from .embeddings import EmbeddingsRepository, get_embeddings_repository
from .training import TrainingRepository, get_training_repository

from core.logging import get_logger

logger = get_logger(__name__)


class SupabaseService:
    """
    Unified facade for all Supabase operations.
    
    Provides structured access to repositories:
    - config: Recognition configuration
    - embeddings: HNSW index embeddings
    - training: Training sessions and verified faces
    
    Also provides backward compatibility via .client property.
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
    
    # Convenience functions
    "get_config_repository",
    "get_embeddings_repository",
    "get_training_repository",
    "get_recognition_config",
]
