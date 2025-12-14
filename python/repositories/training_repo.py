"""
Training repository - handles face_training_sessions table.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from repositories.base import BaseRepository
from models.domain.training import (
    TrainingSession,
    TrainingStatus,
    TrainingMode,
    TrainingMetrics,
    TrainingProgress
)
from core.exceptions import DatabaseError, NotFoundError
from core.logging import get_logger

logger = get_logger(__name__)


class TrainingRepository(BaseRepository):
    """
    Repository for face_training_sessions table.
    """
    
    table_name = "face_training_sessions"
    model_class = TrainingSession
    
    # ============================================================
    # Query Methods
    # ============================================================
    
    async def get_history(
        self,
        limit: int = 10,
        offset: int = 0
    ) -> List[TrainingSession]:
        """
        Get training history ordered by date.
        """
        try:
            response = (
                self.table
                .select("*")
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
            
            return [self._to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("get_history", e)
    
    async def get_latest(self) -> Optional[TrainingSession]:
        """
        Get most recent training session.
        """
        try:
            response = (
                self.table
                .select("*")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            
            if not response.data:
                return None
            
            return self._to_model(response.data[0])
            
        except Exception as e:
            self._handle_error("get_latest", e)
    
    async def get_running(self) -> List[TrainingSession]:
        """
        Get currently running training sessions.
        """
        try:
            response = (
                self.table
                .select("*")
                .eq("status", TrainingStatus.RUNNING.value)
                .execute()
            )
            
            return [self._to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("get_running", e)
    
    # ============================================================
    # Write Methods
    # ============================================================
    
    async def create_session(
        self,
        mode: TrainingMode,
        model_version: str = "v1.0",
        context_weight: float = 0.1,
        min_faces_per_person: int = 3
    ) -> TrainingSession:
        """
        Create new training session.
        """
        try:
            import uuid
            
            data = {
                "id": str(uuid.uuid4()),
                "model_version": model_version,
                "training_mode": mode.value,
                "context_weight": context_weight,
                "min_faces_per_person": min_faces_per_person,
                "faces_count": 0,
                "people_count": 0,
                "metrics": {},
                "status": TrainingStatus.RUNNING.value
            }
            
            response = self.table.insert(data).execute()
            
            if not response.data:
                raise DatabaseError("Failed to create training session")
            
            logger.info(f"Created training session: {data['id']}")
            return self._to_model(response.data[0])
            
        except Exception as e:
            self._handle_error("create_session", e)
    
    async def update_status(
        self,
        session_id: str,
        status: TrainingStatus,
        metrics: TrainingMetrics = None,
        faces_count: int = None,
        people_count: int = None
    ) -> TrainingSession:
        """
        Update training session status.
        """
        try:
            data = {"status": status.value}
            
            if metrics:
                data["metrics"] = metrics.model_dump()
            
            if faces_count is not None:
                data["faces_count"] = faces_count
            
            if people_count is not None:
                data["people_count"] = people_count
            
            if status == TrainingStatus.COMPLETED:
                data["completed_at"] = datetime.utcnow().isoformat()
            
            response = (
                self.table
                .update(data)
                .eq("id", session_id)
                .execute()
            )
            
            if not response.data:
                raise NotFoundError("Training session", session_id)
            
            logger.info(f"Updated training session {session_id}: status={status.value}")
            return self._to_model(response.data[0])
            
        except NotFoundError:
            raise
        except Exception as e:
            self._handle_error("update_status", e)
    
    async def mark_failed(
        self,
        session_id: str,
        error_message: str
    ) -> TrainingSession:
        """
        Mark training session as failed.
        """
        return await self.update_status(
            session_id,
            TrainingStatus.FAILED,
            metrics=TrainingMetrics(error=error_message)
        )
    
    # ============================================================
    # Model Conversion
    # ============================================================
    
    def _to_model(self, data: Dict) -> TrainingSession:
        """Convert database row to TrainingSession model."""
        
        # Parse metrics
        metrics_data = data.get("metrics") or {}
        metrics = TrainingMetrics(**metrics_data) if metrics_data else None
        
        # Parse status
        status_str = data.get("status", "pending")
        try:
            status = TrainingStatus(status_str)
        except ValueError:
            status = TrainingStatus.PENDING
        
        # Parse mode
        mode_str = data.get("training_mode", "full")
        try:
            mode = TrainingMode(mode_str)
        except ValueError:
            mode = TrainingMode.FULL
        
        return TrainingSession(
            id=data["id"],
            model_version=data.get("model_version", "v1.0"),
            training_mode=mode,
            context_weight=data.get("context_weight", 0.1),
            min_faces_per_person=data.get("min_faces_per_person", 3),
            faces_count=data.get("faces_count", 0),
            people_count=data.get("people_count", 0),
            metrics=metrics,
            status=status,
            created_at=data.get("created_at"),
            completed_at=data.get("completed_at")
        )
