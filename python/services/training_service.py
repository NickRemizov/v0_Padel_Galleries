"""
TrainingService - Facade for face recognition indexing operations.
Coordinates dataset preparation and batch recognition.

Delegates to specialized modules in services/training/:
- dataset.py - Dataset preparation
- metrics.py - Metrics calculation
- batch.py - Batch recognition

v4.1: Migrated to SupabaseService (modular architecture)
v4.2: Refactored to delegate to training/ submodules
v4.3: Removed deprecated pipeline.py and storage.py
v4.4: Removed session management (face_training_sessions table deleted)
"""

from typing import List, Dict, Optional

from services.supabase import SupabaseService, get_supabase_service
from services.face_recognition import FaceRecognitionService
from services.training import (
    prepare_dataset as _prepare_dataset,
    batch_recognize as _batch_recognize
)

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TrainingService:
    """
    Facade for training operations.
    Coordinates dataset preparation and batch recognition.

    v4.4: Session management removed (table deleted).
    """

    def __init__(
        self,
        face_service: 'FaceRecognitionService' = None,
        supabase_service: Optional['SupabaseService'] = None,
        supabase_client=None  # Legacy parameter for backward compatibility
    ):
        """
        Initialize training service with dependencies.

        Args:
            face_service: FaceRecognitionService instance
            supabase_service: New SupabaseService instance (preferred)
            supabase_client: Legacy SupabaseClient (deprecated)
        """
        self.face_service = face_service if face_service else FaceRecognitionService()

        # v4.1: Use SupabaseService
        if supabase_service is not None:
            self._supabase = supabase_service
        elif supabase_client is not None:
            logger.warning("[TrainingService] Using legacy supabase_client - please migrate to SupabaseService")
            self._supabase = get_supabase_service()
        else:
            self._supabase = get_supabase_service()

        # Shortcut accessors to repositories
        self._training = self._supabase.training
        self._config = self._supabase.config
        self._faces = self._supabase.faces

        # Legacy compatibility alias
        self.supabase = self._supabase

        logger.info("[TrainingService] Initialized v4.4")

    # ==================== Dataset Preparation ====================

    async def prepare_dataset(self, filters: Dict, options: Dict) -> Dict:
        """
        Prepare dataset for training (without starting training).
        Delegates to training.dataset module.
        """
        return await _prepare_dataset(self._supabase, filters, options)

    # ==================== Batch Recognition ====================

    async def batch_recognize(
        self,
        gallery_ids: Optional[List[str]] = None,
        confidence_threshold: float = 0.60
    ) -> Dict:
        """
        Batch recognition of photos without manual verification.
        Delegates to training.batch module.
        """
        return await _batch_recognize(
            gallery_ids=gallery_ids,
            confidence_threshold=confidence_threshold,
            face_service=self.face_service,
            supabase_service=self._supabase,
            faces_repo=self._faces,
            training_repo=self._training
        )
