"""
Face recognition endpoints.
- POST /recognize-face
- POST /batch-recognize
"""

from fastapi import APIRouter, HTTPException, Depends
import logging
import numpy as np

from models.recognition_schemas import (
    RecognizeFaceRequest,
    FaceRecognitionResponse,
    BatchRecognizeRequest,
)
from .dependencies import face_service_instance, supabase_client_instance

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/recognize-face", response_model=FaceRecognitionResponse)
async def recognize_face(
    request: RecognizeFaceRequest,
    face_service=Depends(lambda: face_service_instance)
):
    """Recognize a single face using the trained model"""
    try:
        config = await supabase_client_instance.get_recognition_config()
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


@router.post("/batch-recognize")
async def batch_recognize(
    request: BatchRecognizeRequest,
    face_service=Depends(lambda: face_service_instance)
):
    """Batch recognize faces in galleries"""
    try:
        config = await supabase_client_instance.get_recognition_config()
        confidence_threshold = request.confidence_threshold or config.get('recognition_threshold', 0.60)
        
        logger.info(f"[v3.22] ===== BATCH RECOGNIZE REQUEST =====")
        logger.info(f"[v3.22] Gallery IDs: {request.gallery_ids}")
        logger.info(f"[v3.22] Confidence Threshold: {confidence_threshold}")
        logger.info(f"[v3.22] Apply quality filters: {request.apply_quality_filters}")
        
        quality_filters = config.get('quality_filters', {})
        min_detection_score = quality_filters.get('min_detection_score', 0.7)
        min_face_size = quality_filters.get('min_face_size', 80.0)
        min_blur_score = quality_filters.get('min_blur_score', 80.0)
        
        logger.info(f"[v3.22] Quality filters loaded:")
        logger.info(f"[v3.22]   min_detection_score: {min_detection_score}")
        logger.info(f"[v3.22]   min_face_size: {min_face_size}")
        logger.info(f"[v3.22]   min_blur_score: {min_blur_score}")
        
        # Get all images from galleries without verified faces
        images = await supabase_client_instance.get_unverified_images(request.gallery_ids)
        
        logger.info(f"[v3.22] Found {len(images)} images to process")
        
        processed = 0
        recognized = 0
        filtered_out = 0
        
        for image in images:
            try:
                # Detect faces (already applies quality filters internally)
                faces = await face_service.detect_faces(image["image_url"], apply_quality_filters=request.apply_quality_filters)
                
                logger.info(f"[v3.22] Detected {len(faces)} faces in image {image['id']} (apply_quality_filters={request.apply_quality_filters})")
                
                for face in faces:
                    det_score = float(face["det_score"])
                    face_width = float(face["bbox"][2] - face["bbox"][0])
                    face_height = float(face["bbox"][3] - face["bbox"][1])
                    face_size = min(face_width, face_height)
                    blur_score = float(face.get("blur_score", 0))
                    
                    if request.apply_quality_filters:
                        # Apply quality filters
                        if det_score < min_detection_score:
                            logger.info(f"[v3.22] Filtered: det_score {det_score:.2f} < {min_detection_score}")
                            filtered_out += 1
                            continue
                        
                        if face_size < min_face_size:
                            logger.info(f"[v3.22] Filtered: face_size {face_size:.1f} < {min_face_size}")
                            filtered_out += 1
                            continue
                        
                        if blur_score < min_blur_score:
                            logger.info(f"[v3.22] Filtered: blur_score {blur_score:.1f} < {min_blur_score}")
                            filtered_out += 1
                            continue
                        
                        logger.info(f"[v3.22] Face passed quality filters: det={det_score:.2f}, size={face_size:.1f}, blur={blur_score:.1f}")
                    
                    # Get embedding
                    embedding = face["embedding"]
                    
                    # Recognize
                    person_id, confidence = await face_service.recognize_face(embedding)
                    
                    logger.info(f"[v3.22] Recognition result for image {image['id']}: person_id={person_id}, confidence={confidence}")
                    
                    # Apply threshold
                    if confidence and (request.confidence_threshold is None or confidence >= request.confidence_threshold):
                        bbox = {
                            "x": float(face["bbox"][0]),
                            "y": float(face["bbox"][1]),
                            "width": float(face["bbox"][2] - face["bbox"][0]),
                            "height": float(face["bbox"][3] - face["bbox"][1]),
                        }
                        
                        await supabase_client_instance.save_photo_face(
                            photo_id=image["id"],
                            person_id=person_id,
                            insightface_bbox=bbox,
                            insightface_descriptor=embedding.tolist(),
                            insightface_confidence=float(face["det_score"]),
                            recognition_confidence=confidence,
                            verified=False,
                        )
                        
                        recognized += 1
                    else:
                        bbox = {
                            "x": float(face["bbox"][0]),
                            "y": float(face["bbox"][1]),
                            "width": float(face["bbox"][2] - face["bbox"][0]),
                            "height": float(face["bbox"][3] - face["bbox"][1]),
                        }
                        
                        await supabase_client_instance.save_photo_face(
                            photo_id=image["id"],
                            person_id=None,
                            insightface_bbox=bbox,
                            insightface_descriptor=embedding.tolist(),
                            insightface_confidence=float(face["det_score"]),
                            recognition_confidence=confidence,
                            verified=False,
                        )
                
                processed += 1
                
            except Exception as e:
                logger.error(f"[v3.22] ERROR processing image {image['id']}: {str(e)}", exc_info=True)
                continue
        
        logger.info(f"[v3.22] ===== END BATCH RECOGNIZE =====")
        logger.info(f"[v3.22] Processed: {processed}, Recognized: {recognized}, Filtered out: {filtered_out}")
        return {
            "success": True,
            "processed": processed,
            "recognized": recognized,
            "filtered_out": filtered_out,
        }
        
    except Exception as e:
        logger.error(f"[v3.22] ERROR in batch_recognize: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
