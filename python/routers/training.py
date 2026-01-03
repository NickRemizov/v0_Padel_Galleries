"""
Training API Router
Endpoints for model training and batch recognition

v1.0: Original implementation
v1.1: Removed per-endpoint auth (moved to middleware)
"""

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime

from core.responses import ApiResponse
from core.exceptions import ValidationError, DatabaseError, NotFoundError
from core.logging import get_logger
from services.training_service import TrainingService

logger = get_logger(__name__)
router = APIRouter()

training_service_instance = None


def set_training_service(service: TrainingService):
    global training_service_instance
    training_service_instance = service


# Pydantic models

class TrainingFilters(BaseModel):
    event_ids: Optional[List[str]] = None
    person_ids: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None


class TrainingOptions(BaseModel):
    min_faces_per_person: int = 3
    include_co_occurring: bool = False
    context_weight: float = 0.1


class PrepareRequest(BaseModel):
    filters: TrainingFilters
    options: TrainingOptions


class ExecuteRequest(BaseModel):
    mode: str  # 'full' or 'incremental'
    filters: TrainingFilters
    options: TrainingOptions
    model_version: Optional[str] = 'v1.0'
    update_existing: bool = True


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

@router.post("/train/prepare")
async def prepare_training(
    request: PrepareRequest,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """Подготовка датасета для обучения (без запуска обучения)."""
    try:
        result = await training_service.prepare_dataset(
            filters=request.filters.model_dump(),
            options=request.options.model_dump()
        )
        return ApiResponse.ok(result)
    except Exception as e:
        logger.error(f"Error preparing training: {e}")
        raise DatabaseError(str(e), operation="prepare_training")


@router.post("/train/execute")
async def execute_training(
    request: ExecuteRequest,
    background_tasks: BackgroundTasks,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """Запуск обучения модели в фоне."""
    try:
        if request.mode not in ['full', 'incremental']:
            raise ValidationError("mode must be 'full' or 'incremental'", field="mode")
        
        session_id = await training_service.execute_training(
            mode=request.mode,
            filters=request.filters.model_dump(),
            options={
                **request.options.model_dump(),
                'model_version': request.model_version,
                'update_existing': request.update_existing
            }
        )
        
        background_tasks.add_task(
            training_service._train_background,
            session_id=session_id,
            mode=request.mode,
            filters=request.filters.model_dump(),
            options={
                **request.options.model_dump(),
                'model_version': request.model_version,
                'update_existing': request.update_existing
            }
        )
        
        logger.info(f"Training started: session_id={session_id}")
        return ApiResponse.ok({
            'session_id': session_id,
            'status': 'running',
            'message': 'Training started in background'
        })
    
    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Error executing training: {e}")
        raise DatabaseError(str(e), operation="execute_training")


@router.get("/train/status/{session_id}")
async def get_training_status(
    session_id: str,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """Получить статус обучения."""
    try:
        status = training_service.get_training_status(session_id)
        if 'error' in status:
            raise NotFoundError("Training session", session_id)
        return ApiResponse.ok(status)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting training status: {e}")
        raise DatabaseError(str(e), operation="get_training_status")


@router.get("/train/history")
async def get_training_history(
    limit: int = 10,
    offset: int = 0,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """Получить историю обучений."""
    try:
        history = training_service.get_training_history(limit, offset)
        return ApiResponse.ok(history)
    except Exception as e:
        logger.error(f"Error getting training history: {e}")
        raise DatabaseError(str(e), operation="get_training_history")


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
