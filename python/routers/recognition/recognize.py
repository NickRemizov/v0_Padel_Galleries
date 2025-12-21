"""
Face recognition endpoints.
- POST /recognize-face
"""

from fastapi import APIRouter, Depends
import numpy as np

from core.config import VERSION
from core.exceptions import RecognitionError
from core.logging import get_logger
from models.recognition_schemas import (
    RecognizeFaceRequest,
    FaceRecognitionResponse,
)
from .dependencies import get_face_service, get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


@router.post("/recognize-face", response_model=FaceRecognitionResponse)
async def recognize_face(
    request: RecognizeFaceRequest,
    face_service=Depends(get_face_service)
):
    """Recognize a single face using the trained model"""
    supabase_client = get_supabase_client()
    try:
        config = await supabase_client.get_recognition_config()
        threshold = request.confidence_threshold or config.get('recognition_threshold', 0.60)
        
        logger.info(f"[v{VERSION}] Recognizing face, threshold: {threshold}")
        
        embedding = np.array(request.embedding, dtype=np.float32)
        
        person_id, confidence = await face_service.recognize_face(
            embedding, 
            confidence_threshold=threshold
        )
        
        logger.info(f"[v{VERSION}] Result: person_id={person_id}, confidence={confidence}")
        
        return {
            "person_id": person_id,
            "confidence": confidence,
        }
        
    except Exception as e:
        logger.error(f"[v{VERSION}] Error: {str(e)}")
        raise RecognitionError(f"Failed to recognize face: {str(e)}")
