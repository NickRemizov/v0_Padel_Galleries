"""
Face recognition endpoints.
- POST /recognize-face

v1.1: Unified to ApiResponse format
"""

from fastapi import APIRouter, Depends
import numpy as np

from core.config import VERSION
from core.responses import ApiResponse
from core.exceptions import RecognitionError
from core.logging import get_logger
from .dependencies import get_face_service, get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


@router.post("/recognize-face")
async def recognize_face(
    request: dict,
    face_service=Depends(get_face_service)
):
    """Recognize a single face using the trained model"""
    supabase_client = get_supabase_client()
    try:
        # get_recognition_config is sync method - no await
        config = supabase_client.get_recognition_config()
        # v6.1.2: Use 'is None' check to allow threshold=0.0 for testing (P3 fix)
        threshold = request.get("confidence_threshold")
        if threshold is None:
            threshold = config.get('confidence_thresholds', {}).get('high_data', 0.60)
        
        logger.info(f"[v{VERSION}] Recognizing face, threshold: {threshold}")
        
        embedding = np.array(request.get("embedding"), dtype=np.float32)
        
        person_id, confidence = await face_service.recognize_face(
            embedding, 
            confidence_threshold=threshold
        )
        
        logger.info(f"[v{VERSION}] Result: person_id={person_id}, confidence={confidence}")
        
        return ApiResponse.ok({
            "person_id": person_id,
            "confidence": confidence,
        }).model_dump()
        
    except Exception as e:
        logger.error(f"[v{VERSION}] Error: {str(e)}")
        raise RecognitionError(f"Failed to recognize face: {str(e)}")
