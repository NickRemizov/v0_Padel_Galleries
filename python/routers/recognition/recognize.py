"""
Face recognition endpoints.
- POST /recognize-face
"""

from fastapi import APIRouter, HTTPException, Depends
import logging
import numpy as np

from models.recognition_schemas import (
    RecognizeFaceRequest,
    FaceRecognitionResponse,
)
from .dependencies import get_face_service, get_supabase_client

logger = logging.getLogger(__name__)
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

        logger.info(f"[Recognition] Recognizing face, threshold: {threshold}")

        embedding = np.array(request.embedding, dtype=np.float32)

        person_id, confidence = await face_service.recognize_face(
            embedding,
            confidence_threshold=threshold
        )

        logger.info(f"[Recognition] Result: person_id={person_id}, confidence={confidence}")

        return {
            "person_id": person_id,
            "confidence": confidence,
        }

    except Exception as e:
        logger.error(f"[Recognition] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
