"""
Config API Router
Endpoints для управления конфигурацией
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from services.supabase_client import SupabaseClient

router = APIRouter(prefix="/api/v2", tags=["config"])

class QualityConfig(BaseModel):
    min_face_size: Optional[int] = None
    min_detection_score: Optional[float] = None
    min_blur_score: Optional[int] = None

@router.get("/config")
async def get_config():
    """Получение текущей конфигурации распознавания"""
    try:
        supabase = SupabaseClient()
        
        # Получаем настройки из БД
        response = supabase.client.table('recognition_settings').select('*').eq('key', 'quality_filters').single().execute()
        
        if response.data:
            return response.data.get('value', {})
        else:
            # Дефолтные настройки
            return {
                "min_face_size": 40,
                "min_detection_score": 0.5,
                "min_blur_score": 80
            }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/config")
async def update_config(config: QualityConfig):
    """Обновление конфигурации распознавания"""
    try:
        supabase = SupabaseClient()
        
        # Обновляем настройки в БД
        config_dict = config.dict(exclude_none=True)
        
        supabase.client.table('recognition_settings').upsert({
            'key': 'quality_filters',
            'value': config_dict
        }, on_conflict='key').execute()
        
        return {"status": "ok", "config": config_dict}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
