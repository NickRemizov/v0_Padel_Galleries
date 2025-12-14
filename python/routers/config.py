"""
Config API Router
Endpoints для управления конфигурацией
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger
from services.supabase_client import SupabaseClient

logger = get_logger(__name__)
router = APIRouter(prefix="/api/v2", tags=["config"])


class QualityConfig(BaseModel):
    min_face_size: Optional[int] = None
    min_detection_score: Optional[float] = None
    min_blur_score: Optional[int] = None


supabase_client_instance = None


def set_supabase_client(client: SupabaseClient):
    global supabase_client_instance
    supabase_client_instance = client


@router.get("/config")
async def get_config(
    supabase_client: SupabaseClient = Depends(lambda: supabase_client_instance)
):
    """Получение текущей конфигурации распознавания"""
    try:
        response = supabase_client.client.table('recognition_settings').select('*').eq('key', 'quality_filters').single().execute()
        
        if response.data:
            return ApiResponse.ok(response.data.get('value', {}))
        else:
            # Дефолтные настройки
            return ApiResponse.ok({
                "min_face_size": 40,
                "min_detection_score": 0.5,
                "min_blur_score": 80
            })
        
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        raise DatabaseError(str(e), operation="get_config")


@router.put("/config")
async def update_config(
    config: QualityConfig,
    supabase_client: SupabaseClient = Depends(lambda: supabase_client_instance)
):
    """Обновление конфигурации распознавания"""
    try:
        config_dict = config.model_dump(exclude_none=True)
        
        supabase_client.client.table('recognition_settings').upsert({
            'key': 'quality_filters',
            'value': config_dict
        }, on_conflict='key').execute()
        
        logger.info(f"Config updated: {config_dict}")
        return ApiResponse.ok(config_dict)
        
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise DatabaseError(str(e), operation="update_config")
