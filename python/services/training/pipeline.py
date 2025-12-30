"""
Training Pipeline

Background training process with progressive algorithm.
Optimized: reuses existing embeddings from DB.
"""

from typing import List, Dict
import numpy as np
import hnswlib

from .dataset import download_photo, match_face_to_detected
from .metrics import calculate_metrics
from .session import update_session_completed, update_session_failed
from .storage import save_index

import logging

logger = logging.getLogger(__name__)


async def run_training_pipeline(
    session_id: str,
    mode: str,
    filters: Dict,
    options: Dict,
    face_service,
    training_repo,
    progress_tracker: Dict
):
    """
    Background training process with progressive algorithm.
    
    Args:
        session_id: Training session ID
        mode: 'full' or 'incremental'
        filters: Filter options (event_ids, person_ids, dates)
        options: Training options
        face_service: FaceRecognitionService instance
        training_repo: Training repository instance
        progress_tracker: Dict to update progress (current, total, step)
    """
    logger.info(f"[Pipeline] Background training started for session {session_id}")
    
    try:
        # Ensure InsightFace is initialized
        face_service._ensure_initialized()
        
        progress_tracker.update({
            'current': 0,
            'total': 0,
            'step': 'Loading verified faces from database'
        })
        
        # Load verified faces with descriptors
        faces = await training_repo.get_verified_faces_with_descriptors(
            event_ids=filters.get('event_ids'),
            person_ids=filters.get('person_ids'),
            date_from=filters.get('date_from'),
            date_to=filters.get('date_to'),
            min_faces_per_person=options['min_faces_per_person']
        )
        
        logger.info(f"[Pipeline] Loaded {len(faces)} verified faces")
        
        # Separate faces with/without descriptors
        faces_with_descriptors = []
        faces_without_descriptors = []
        
        for face in faces:
            if face.get('insightface_descriptor'):
                faces_with_descriptors.append(face)
            else:
                faces_without_descriptors.append(face)
        
        logger.info(f"[Pipeline] With descriptors: {len(faces_with_descriptors)}")
        logger.info(f"[Pipeline] Without descriptors: {len(faces_without_descriptors)}")
        
        # Collect existing descriptors
        descriptors = []
        person_ids = []
        
        for face in faces_with_descriptors:
            descriptor = np.array(face['insightface_descriptor'])
            descriptors.append(descriptor)
            person_ids.append(face['person_id'])
        
        logger.info(f"[Pipeline] Reused {len(descriptors)} existing descriptors")
        
        # Process faces without descriptors
        if faces_without_descriptors:
            await _extract_missing_descriptors(
                session_id=session_id,
                faces_without_descriptors=faces_without_descriptors,
                descriptors=descriptors,
                person_ids=person_ids,
                face_service=face_service,
                training_repo=training_repo,
                supabase_service=training_repo._supabase if hasattr(training_repo, '_supabase') else None,
                progress_tracker=progress_tracker
            )
        
        logger.info(f"[Pipeline] Total descriptors: {len(descriptors)} from {len(set(person_ids))} people")
        
        # Build HNSW index
        progress_tracker['step'] = 'Building HNSWLIB index'
        
        if mode == 'full':
            face_service.players_index = hnswlib.Index(space='cosine', dim=512)
            face_service.players_index.init_index(
                max_elements=10000,
                ef_construction=200,
                M=16
            )
            face_service.player_ids_map = []
        
        if descriptors:
            start_idx = len(face_service.player_ids_map)
            face_service.players_index.add_items(
                np.array(descriptors),
                list(range(start_idx, start_idx + len(descriptors)))
            )
            face_service.player_ids_map.extend(person_ids)
        
        logger.info(f"[Pipeline] Index built with {len(descriptors)} descriptors")
        
        # Save index to disk
        progress_tracker['step'] = 'Saving index to disk'
        await save_index(face_service)
        
        # Calculate metrics
        progress_tracker['step'] = 'Calculating metrics'
        metrics = await calculate_metrics(descriptors, person_ids)
        
        # Update session as completed
        update_session_completed(
            training_repo=training_repo,
            session_id=session_id,
            faces_count=len(descriptors),
            people_count=len(set(person_ids)),
            metrics=metrics
        )
        
        progress_tracker['step'] = 'Completed'
        logger.info("[Pipeline] Training completed successfully")
        
    except Exception as e:
        logger.error(f"[Pipeline] Training failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        update_session_failed(training_repo, session_id, str(e))


async def _extract_missing_descriptors(
    session_id: str,
    faces_without_descriptors: List[Dict],
    descriptors: List[np.ndarray],
    person_ids: List[str],
    face_service,
    training_repo,
    supabase_service,
    progress_tracker: Dict
):
    """
    Extract descriptors for faces that don't have them yet.
    """
    progress_tracker['step'] = 'Extracting missing descriptors'
    progress_tracker['total'] = len(faces_without_descriptors)
    
    # Group by photo_id
    photos_to_process = {}
    for face in faces_without_descriptors:
        photo_id = face['photo_id']
        if photo_id not in photos_to_process:
            photos_to_process[photo_id] = []
        photos_to_process[photo_id].append(face)
    
    processed_count = 0
    
    for photo_id, photo_faces in photos_to_process.items():
        progress_tracker['current'] = processed_count
        
        try:
            photo_url = photo_faces[0]['photo_url']
            image = await download_photo(photo_url, supabase_client=supabase_service)
            
            detected_faces = face_service.app.get(image)
            
            if not detected_faces:
                logger.warning(f"No faces detected in photo {photo_id}")
                processed_count += len(photo_faces)
                continue
            
            for face_data in photo_faces:
                saved_bbox = face_data['insightface_bbox']
                best_match, best_iou = match_face_to_detected(
                    saved_bbox, detected_faces
                )
                
                if best_match:
                    descriptor = best_match.embedding
                    confidence = float(best_match.det_score)
                    
                    descriptors.append(descriptor)
                    person_ids.append(face_data['person_id'])
                    
                    await training_repo.update_face_descriptor(
                        face_id=face_data['face_id'],
                        descriptor=descriptor,
                        det_score=confidence,
                        bbox={
                            'x': float(best_match.bbox[0]),
                            'y': float(best_match.bbox[1]),
                            'width': float(best_match.bbox[2] - best_match.bbox[0]),
                            'height': float(best_match.bbox[3] - best_match.bbox[1])
                        },
                        training_context={
                            'gallery_id': face_data.get('gallery_id'),
                            'gallery_name': face_data.get('gallery_name'),
                            'training_session_id': session_id,
                            'bbox_iou': best_iou
                        }
                    )
                    
                    logger.info(f"Extracted descriptor for face {face_data['face_id']} (IoU: {best_iou:.2f})")
                else:
                    logger.warning(f"No match for face {face_data['face_id']} (best IoU: {best_iou:.2f})")
                
                processed_count += 1
                
        except Exception as e:
            logger.error(f"Failed to process photo {photo_id}: {e}")
            processed_count += len(photo_faces)
