"""
Batch Recognition

Batch recognition of photos without manual verification.
"""

from typing import List, Dict, Optional
import numpy as np

from .dataset import download_photo, match_face_to_detected

import logging

logger = logging.getLogger(__name__)


async def batch_recognize(
    gallery_ids: Optional[List[str]],
    confidence_threshold: float,
    face_service,
    supabase_service,
    faces_repo,
    training_repo
) -> Dict:
    """
    Batch recognition of photos without manual verification.
    Processes only photos where verified = false or NULL.
    
    Args:
        gallery_ids: List of gallery_id to process (None = all)
        confidence_threshold: Threshold for saving result (0-1)
        face_service: FaceRecognitionService instance
        supabase_service: SupabaseService instance
        faces_repo: Faces repository instance
        training_repo: Training repository instance
    
    Returns:
        Statistics about recognition results
    """
    logger.info(f"[BatchRecognition] Starting (threshold={confidence_threshold})")
    
    try:
        face_service._ensure_initialized()
        
        # Query unverified faces using raw client
        query = supabase_service.client.table("photo_faces").select(
            "id, photo_id, insightface_bbox, insightface_descriptor, "
            "gallery_images(id, image_url, gallery_id)"
        ).or_("verified.is.null,verified.eq.false")
        
        if gallery_ids:
            query = query.in_("gallery_images.gallery_id", gallery_ids)
        
        response = query.execute()
        unverified_faces = response.data
        
        logger.info(f"Found {len(unverified_faces)} unverified faces")
        
        total_processed = 0
        recognized_count = 0
        unknown_count = 0
        
        for face_data in unverified_faces:
            face_id = face_data['id']
            descriptor = face_data.get('insightface_descriptor')
            
            # Extract descriptor if missing
            if not descriptor:
                descriptor = await _extract_single_descriptor(
                    face_data=face_data,
                    face_service=face_service,
                    supabase_service=supabase_service,
                    training_repo=training_repo
                )
                if not descriptor:
                    continue
            
            # Recognize
            descriptor_array = np.array(descriptor)
            result = await face_service.recognize_face(
                embedding=descriptor_array,
                confidence_threshold=confidence_threshold
            )
            
            if result and result[0]:
                person_id, confidence = result
                faces_repo.update_recognition_result(
                    face_id=face_id,
                    person_id=person_id,
                    recognition_confidence=confidence,
                    verified=False
                )
                recognized_count += 1
                logger.info(f"Recognized face {face_id} as {person_id} ({confidence:.2f})")
            else:
                faces_repo.update_recognition_result(
                    face_id=face_id,
                    person_id=None,
                    recognition_confidence=0.0,
                    verified=False
                )
                unknown_count += 1
            
            total_processed += 1
        
        logger.info(f"Batch recognition completed: {recognized_count} recognized, {unknown_count} unknown")
        
        return {
            'total_processed': total_processed,
            'recognized': recognized_count,
            'unknown': unknown_count,
            'recognition_rate': (recognized_count / total_processed * 100) if total_processed > 0 else 0,
            'confidence_threshold': confidence_threshold
        }
        
    except Exception as e:
        logger.error(f"Batch recognition failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise


async def _extract_single_descriptor(
    face_data: Dict,
    face_service,
    supabase_service,
    training_repo
) -> Optional[np.ndarray]:
    """
    Extract descriptor for a single face.
    """
    try:
        photo = face_data.get('gallery_images')
        if not photo:
            return None
        
        photo_url = photo['image_url']
        bbox = face_data['insightface_bbox']
        
        image = await download_photo(photo_url, supabase_client=supabase_service)
        detected_faces = face_service.app.get(image)
        
        if not detected_faces:
            return None
        
        best_match, best_iou = match_face_to_detected(bbox, detected_faces)
        
        if best_match and best_iou > 0.3:
            descriptor = best_match.embedding

            await training_repo.update_face_descriptor(
                face_id=face_data['id'],
                descriptor=descriptor,
                det_score=float(best_match.det_score),
                bbox={
                    'x': float(best_match.bbox[0]),
                    'y': float(best_match.bbox[1]),
                    'width': float(best_match.bbox[2] - best_match.bbox[0]),
                    'height': float(best_match.bbox[3] - best_match.bbox[1])
                }
            )

            return descriptor
        
        return None
        
    except Exception as e:
        logger.error(f"Failed to extract descriptor: {e}")
        return None
