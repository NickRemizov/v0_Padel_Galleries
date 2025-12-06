from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime

from services.training_service import TrainingService

router = APIRouter()
# training_service = TrainingService()  # УДАЛЕНО - теперь через DI

# Pydantic models for validation

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
    gallery_ids: Optional[List[str]] = None  # Specific galleries, or None for all unverified
    confidence_threshold: Optional[float] = None  # Override default threshold


# Endpoints

@router.post("/train/prepare")
async def prepare_training(
    request: PrepareRequest,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """
    Подготовка датасета для обучения (без запуска обучения).
    
    Возвращает статистику и валидацию датасета.
    """
    try:
        result = await training_service.prepare_dataset(
            filters=request.filters.dict(),
            options=request.options.dict()
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train/execute")
async def execute_training(
    request: ExecuteRequest,
    background_tasks: BackgroundTasks,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """
    Запуск обучения модели.
    
    Обучение выполняется в фоне. Возвращает session_id для отслеживания прогресса.
    """
    try:
        # Validate mode
        if request.mode not in ['full', 'incremental']:
            raise HTTPException(
                status_code=400,
                detail="mode must be 'full' or 'incremental'"
            )
        
        # Create session
        session_id = await training_service.execute_training(
            mode=request.mode,
            filters=request.filters.dict(),
            options={
                **request.options.dict(),
                'model_version': request.model_version,
                'update_existing': request.update_existing
            }
        )
        
        # Start training in background
        background_tasks.add_task(
            training_service._train_background,
            session_id=session_id,
            mode=request.mode,
            filters=request.filters.dict(),
            options={
                **request.options.dict(),
                'model_version': request.model_version,
                'update_existing': request.update_existing
            }
        )
        
        return {
            'session_id': session_id,
            'status': 'running',
            'message': 'Training started in background'
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/train/status/{session_id}")
async def get_training_status(
    session_id: str,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """
    Получить статус обучения по session_id.
    """
    try:
        status = training_service.get_training_status(session_id)
        if 'error' in status:
            raise HTTPException(status_code=404, detail=status['error'])
        return status
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/train/history")
async def get_training_history(
    limit: int = 10,
    offset: int = 0,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """
    Получить историю обучений.
    """
    try:
        history = training_service.get_training_history(limit, offset)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recognize/batch")
async def batch_recognize_photos(
    request: BatchRecognitionRequest,
    background_tasks: BackgroundTasks,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """
    Пакетное распознавание фото без ручной верификации.
    
    Обрабатывает только фото где verified = false или NULL.
    Использует confidence_threshold для фильтрации результатов.
    """
    try:
        # Get confidence threshold from request or config
        if request.confidence_threshold is not None:
            threshold = request.confidence_threshold
        else:
            config = await training_service.supabase.get_recognition_config()
            threshold = config.get('confidence_threshold', 0.60)
        
        # Start batch recognition
        result = await training_service.batch_recognize(
            gallery_ids=request.gallery_ids,
            confidence_threshold=threshold
        )
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config")
async def get_config(
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """
    Получить текущую конфигурацию распознавания.
    """
    try:
        # Try from Supabase first
        config = await training_service.supabase.get_recognition_config()
        
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config")
async def update_config(
    updates: ConfigUpdate,
    training_service: TrainingService = Depends(lambda: training_service_instance)
):
    """
    Обновить конфигурацию распознавания.
    """
    try:
        settings = {}
        
        if updates.confidence_thresholds is not None:
            settings['confidence_thresholds'] = updates.confidence_thresholds
        if updates.context_weight is not None:
            settings['context_weight'] = updates.context_weight
        if updates.min_faces_per_person is not None:
            settings['min_faces_per_person'] = updates.min_faces_per_person
        if updates.auto_retrain_threshold is not None:
            settings['auto_retrain_threshold'] = updates.auto_retrain_threshold
        if updates.auto_retrain_percentage is not None:
            settings['auto_retrain_percentage'] = updates.auto_retrain_percentage
        if updates.quality_filters is not None:
            settings['quality_filters'] = updates.quality_filters
        
        if settings:
            await training_service.supabase.update_recognition_config(settings)
        
        return {
            'success': True,
            'updated_at': datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

training_service_instance = None

def set_training_service(service: TrainingService):
    global training_service_instance
    training_service_instance = service
