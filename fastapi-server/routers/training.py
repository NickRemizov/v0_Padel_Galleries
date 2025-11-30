from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, Dict, List
from pydantic import BaseModel
from services.training_service import TrainingService
from services.face_recognition import FaceRecognitionService
from services.database import PlayerDatabase

router = APIRouter(prefix="/api/v2/train", tags=["training"])

# Dependency injection
def get_training_service():
    face_service = FaceRecognitionService()
    db = PlayerDatabase()
    return TrainingService(face_service, db)


class TrainingFilters(BaseModel):
    event_ids: Optional[List[str]] = None
    person_ids: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None


class TrainingOptions(BaseModel):
    min_faces_per_person: int = 3
    include_co_occurring: bool = True
    context_weight: float = 0.1


class PrepareRequest(BaseModel):
    filters: Optional[TrainingFilters] = None
    options: Optional[TrainingOptions] = None


class ExecuteRequest(BaseModel):
    mode: str = "full"  # 'full' or 'incremental'
    filters: Optional[TrainingFilters] = None
    options: Optional[TrainingOptions] = None
    model_version: Optional[str] = "v1.0"
    update_existing: bool = True


@router.post("/prepare")
async def prepare_training(
    request: PrepareRequest,
    training_service: TrainingService = Depends(get_training_service)
):
    """
    Подготовка датасета для обучения (без запуска обучения)
    """
    try:
        filters_dict = request.filters.dict() if request.filters else {}
        options_dict = request.options.dict() if request.options else {}
        
        result = await training_service.prepare_training_dataset(
            filters=filters_dict,
            options=options_dict
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute")
async def execute_training(
    request: ExecuteRequest,
    training_service: TrainingService = Depends(get_training_service)
):
    """
    Запуск обучения модели
    """
    try:
        filters_dict = request.filters.dict() if request.filters else {}
        options_dict = request.options.dict() if request.options else {}
        
        if request.model_version:
            options_dict["model_version"] = request.model_version
        
        options_dict["update_existing"] = request.update_existing
        
        result = await training_service.execute_training(
            mode=request.mode,
            filters=filters_dict,
            options=options_dict
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{session_id}")
async def get_training_status(
    session_id: str,
    training_service: TrainingService = Depends(get_training_service)
):
    """
    Получение статуса обучения
    """
    # TODO: Реализовать получение статуса из БД
    return {
        "session_id": session_id,
        "status": "completed",
        "progress": {
            "current": 1064,
            "total": 1064,
            "percentage": 100
        }
    }


@router.get("/history")
async def get_training_history(
    limit: int = 10,
    offset: int = 0,
    training_service: TrainingService = Depends(get_training_service)
):
    """
    Получение истории обучений
    """
    try:
        result = training_service.get_training_history(limit=limit, offset=offset)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
