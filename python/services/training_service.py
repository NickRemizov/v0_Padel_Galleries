"""
TrainingService - Facade for face recognition model training.
Coordinates dataset preparation, training execution, and metrics calculation.

Delegates to specialized modules in services/training/:
- dataset.py - Dataset preparation
- metrics.py - Metrics calculation
- session.py - Session management
- pipeline.py - Background training process
- storage.py - HNSW index save/load
- batch.py - Batch recognition

v4.1: Migrated to SupabaseService (modular architecture)
v4.2: Refactored to delegate to training/ submodules
"""

from typing import List, Dict, Optional

from services.supabase import SupabaseService, get_supabase_service
from services.face_recognition import FaceRecognitionService
from services.training import (
    prepare_dataset as _prepare_dataset,
    create_session,
    get_status,
    get_history,
    run_training_pipeline,
    batch_recognize as _batch_recognize
)

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TrainingService:
    """
    Facade for training operations.
    Manages training sessions and coordinates training pipeline.
    
    v4.2: Now delegates to modular training/ subpackage.
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
        
        self.current_session_id = None
        self.current_progress = {'current': 0, 'total': 0, 'step': ''}
        logger.info("[TrainingService] Initialized v4.2")
    
    # ==================== Dataset Preparation ====================
    
    async def prepare_dataset(self, filters: Dict, options: Dict) -> Dict:
        """
        Prepare dataset for training (without starting training).
        Delegates to training.dataset module.
        """
        return await _prepare_dataset(self._supabase, filters, options)
    
    # ==================== Training Execution ====================
    
    async def execute_training(
        self,
        mode: str,
        filters: Dict,
        options: Dict
    ) -> str:
        """
        Start model training.
        
        Returns:
            session_id for tracking progress
        """
        logger.info(f"[TrainingService] Starting training in {mode} mode...")
        
        # Create session using session module
        session_id = create_session(self._training, mode, options)
        self.current_session_id = session_id
        
        return session_id
    
    async def _train_background(
        self,
        session_id: str,
        mode: str,
        filters: Dict,
        options: Dict
    ):
        """
        Background training process.
        Delegates to training.pipeline module.
        """
        await run_training_pipeline(
            session_id=session_id,
            mode=mode,
            filters=filters,
            options=options,
            face_service=self.face_service,
            training_repo=self._training,
            progress_tracker=self.current_progress
        )
    
    # ==================== Status & History ====================
    
    def get_training_status(self, session_id: str) -> Dict:
        """Get training status by session ID."""
        return get_status(
            training_repo=self._training,
            session_id=session_id,
            current_session_id=self.current_session_id,
            current_progress=self.current_progress
        )
    
    def get_training_history(self, limit: int = 10, offset: int = 0) -> Dict:
        """Get training history from Supabase."""
        return get_history(self._training, limit, offset)
    
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
