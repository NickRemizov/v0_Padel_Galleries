"""
Training API Router
Endpoints for batch recognition and config management.

v1.0: Original implementation
v1.1: Removed per-endpoint auth (moved to middleware)
v2.0: Removed training session endpoints (table deleted)
"""

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger
from services.training_service import TrainingService

logger = get_logger(__name__)
router = APIRouter()

training_service_instance = None


def set_training_service(service: TrainingService):
    global training_service_instance
    training_service_instance = service


# Pydantic models

class ConfigUpdate(BaseModel):
    confidence_thresholds: Optional[Dict[str, float]] = None
    context_weight: Optional[float] = None
    min_faces_per_person: Optional[int] = None
    auto_retrain_threshold: Optional[int] = None
    auto_retrain_percentage: Optional[float] = None
    quality_filters: Optional[Dict[str, float]] = None


class BatchRecognitionRequest(BaseModel):
    gallery_ids: Optional[List[str]] = None
    confidence_threshold: Optional[float] = None


# Endpoints

@router.post("/recognize/batch")
async def batch_recognize_photos(
    request: BatchRecognitionRequest,
    background_tasks: BackgroundTasks,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """Пакетное распознавание фото."""
    try:
        if request.confidence_threshold is not None:
            threshold = request.confidence_threshold
        else:
            # Sync method - no await
            config = training_service.supabase.get_recognition_config()
            threshold = config.get('confidence_thresholds', {}).get('high_data', 0.60)

        result = await training_service.batch_recognize(
            gallery_ids=request.gallery_ids,
            confidence_threshold=threshold
        )

        return ApiResponse.ok(result)

    except Exception as e:
        logger.error(f"Error in batch recognition: {e}")
        raise DatabaseError(str(e), operation="batch_recognize")


@router.get("/config")
async def get_config(
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """Получить текущую конфигурацию."""
    try:
        # Sync method - no await
        config = training_service.supabase.get_recognition_config()
        return ApiResponse.ok(config)
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        raise DatabaseError(str(e), operation="get_config")


@router.put("/config")
async def update_config(
    updates: ConfigUpdate,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """Обновить конфигурацию."""
    try:
        settings = updates.model_dump(exclude_none=True)

        if settings:
            # Sync method - no await
            training_service.supabase.update_recognition_config(settings)

        logger.info(f"Config updated: {list(settings.keys())}")
        return ApiResponse.ok({
            'updated': True,
            'updated_at': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise DatabaseError(str(e), operation="update_config")
