"""
Images Processing Operations

Endpoints:
- PATCH /{image_id}/mark-processed  - Mark image as processed
- POST /{image_id}/auto-recognize    - Auto-recognize faces
"""

from fastapi import APIRouter
import json
import numpy as np

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger

from .helpers import get_supabase_db, get_face_service

logger = get_logger(__name__)
router = APIRouter()


@router.patch("/{image_id}/mark-processed")
async def mark_image_as_processed(image_id: str):
    """Помечает фото как обработанное."""
    supabase_db = get_supabase_db()
    
    try:
        logger.info(f"Marking image {image_id} as processed")
        
        result = supabase_db.client.table("gallery_images").update({"has_been_processed": True}).eq("id", image_id).execute()
        
        if not result.data:
            raise NotFoundError("Image", image_id)
        
        logger.info(f"Image {image_id} marked as processed")
        return ApiResponse.ok({"processed": True})
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error marking image as processed: {e}")
        raise DatabaseError(str(e), operation="mark_processed")


@router.post("/{image_id}/auto-recognize")
async def auto_recognize_faces(image_id: str):
    """
    Автоматическое распознавание неподтверждённых лиц на фото.
    
    v1.2: Ищет в индексе совпадения для всех лиц без person_id или с verified=false.
    При нахождении совпадения с confidence >= threshold обновляет person_id в БД.
    
    Returns:
        - recognized: количество распознанных лиц
        - skipped: количество пропущенных (уже verified или нет дескриптора)
        - total_unverified: всего неподтверждённых лиц
        - results: детали по каждому лицу
    """
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    try:
        logger.info(f"Auto-recognizing faces for image: {image_id}")
        
        # Load recognition config
        config = supabase_db.get_recognition_config()
        threshold = config.get('confidence_thresholds', {}).get('high_data', 0.60)
        logger.info(f"Using recognition threshold: {threshold}")
        
        # Check if index is available
        has_index = hasattr(face_service, 'players_index') and face_service.players_index is not None
        index_count = face_service.players_index.get_current_count() if has_index else 0
        
        if not has_index or index_count == 0:
            logger.warning("No players index available for recognition")
            return ApiResponse.ok({
                "recognized": 0,
                "skipped": 0,
                "total_unverified": 0,
                "results": [],
                "message": "Index not available"
            })
        
        # Get all unverified faces with descriptors
        result = supabase_db.client.table("photo_faces").select(
            "id, person_id, verified, insightface_descriptor, recognition_confidence"
        ).eq("photo_id", image_id).eq("verified", False).execute()
        
        faces = result.data or []
        logger.info(f"Found {len(faces)} unverified faces")
        
        if not faces:
            return ApiResponse.ok({
                "recognized": 0,
                "skipped": 0,
                "total_unverified": 0,
                "results": [],
                "message": "No unverified faces"
            })
        
        recognized = 0
        skipped = 0
        results = []
        
        for face in faces:
            face_id = face["id"]
            descriptor = face.get("insightface_descriptor")
            
            # Skip if no descriptor
            if not descriptor:
                skipped += 1
                results.append({
                    "face_id": face_id,
                    "status": "skipped",
                    "reason": "no_descriptor"
                })
                continue
            
            # Parse descriptor
            try:
                if isinstance(descriptor, str):
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)
                elif isinstance(descriptor, list):
                    embedding = np.array(descriptor, dtype=np.float32)
                else:
                    skipped += 1
                    results.append({
                        "face_id": face_id,
                        "status": "skipped",
                        "reason": "invalid_descriptor"
                    })
                    continue
            except Exception as e:
                logger.warning(f"Failed to parse descriptor for face {face_id}: {e}")
                skipped += 1
                results.append({
                    "face_id": face_id,
                    "status": "skipped",
                    "reason": "parse_error"
                })
                continue
            
            # Search in index
            try:
                person_id, confidence = await face_service.recognize_face(
                    embedding,
                    confidence_threshold=threshold
                )
                
                if person_id and confidence >= threshold:
                    # Update face with recognized person
                    supabase_db.client.table("photo_faces").update({
                        "person_id": person_id,
                        "recognition_confidence": confidence
                    }).eq("id", face_id).execute()
                    
                    # Get person name for result
                    person_result = supabase_db.client.table("people").select(
                        "real_name, telegram_name"
                    ).eq("id", person_id).execute()
                    
                    person_name = "Unknown"
                    if person_result.data:
                        person_name = person_result.data[0].get("real_name") or person_result.data[0].get("telegram_name") or "Unknown"
                    
                    recognized += 1
                    results.append({
                        "face_id": face_id,
                        "status": "recognized",
                        "person_id": person_id,
                        "person_name": person_name,
                        "confidence": round(confidence, 3)
                    })
                    logger.info(f"Face {face_id} recognized as {person_name} (confidence: {confidence:.3f})")
                else:
                    results.append({
                        "face_id": face_id,
                        "status": "no_match",
                        "best_confidence": round(confidence, 3) if confidence else 0
                    })
                    
            except Exception as e:
                logger.warning(f"Recognition error for face {face_id}: {e}")
                results.append({
                    "face_id": face_id,
                    "status": "error",
                    "error": str(e)
                })
        
        logger.info(f"Auto-recognition complete: {recognized} recognized, {skipped} skipped out of {len(faces)}")
        
        return ApiResponse.ok({
            "recognized": recognized,
            "skipped": skipped,
            "total_unverified": len(faces),
            "results": results
        })
        
    except Exception as e:
        logger.error(f"Error in auto-recognize: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="auto_recognize")
