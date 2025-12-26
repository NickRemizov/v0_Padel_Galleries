"""
TrainingService - Facade for face recognition model training.
Coordinates dataset preparation, training execution, and metrics calculation.

Delegates to specialized modules:
- training/dataset.py - Dataset preparation
- training/metrics.py - Metrics calculation

v4.1: Migrated to SupabaseService (modular architecture)
"""

import uuid
import os
import json
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import numpy as np
import hnswlib

# v4.1: Use SupabaseService instead of SupabaseClient
from services.supabase import SupabaseService, get_supabase_service
from services.face_recognition import FaceRecognitionService
from services.training.dataset import (
    prepare_dataset as _prepare_dataset,
    download_photo,
    match_face_to_detected
)
from services.training.metrics import (
    calculate_metrics as _calculate_metrics,
    calculate_distribution
)

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TrainingService:
    """
    Facade for training operations.
    Manages training sessions and coordinates training pipeline.
    
    v4.1: Now uses SupabaseService with modular repositories.
    """
    
    def __init__(
        self,
        face_service: 'FaceRecognitionService' = None,
        supabase_service: Optional['SupabaseService'] = None,
        supabase_client=None  # Legacy parameter for backward compatibility
    ):
        """
        Initialize training service with dependencies.
        
        Args:
            face_service: FaceRecognitionService instance
            supabase_service: New SupabaseService instance (preferred)
            supabase_client: Legacy SupabaseClient (deprecated)
        """
        self.face_service = face_service if face_service else FaceRecognitionService()
        
        # v4.1: Use SupabaseService
        if supabase_service is not None:
            self._supabase = supabase_service
        elif supabase_client is not None:
            logger.warning("[TrainingService] Using legacy supabase_client - please migrate to SupabaseService")
            self._supabase = get_supabase_service()
        else:
            self._supabase = get_supabase_service()
        
        # Shortcut accessors to repositories
        self._training = self._supabase.training
        self._config = self._supabase.config
        self._faces = self._supabase.faces
        
        # Legacy compatibility alias
        self.supabase = self._supabase
        
        self.current_session_id = None
        self.current_progress = {'current': 0, 'total': 0, 'step': ''}
        logger.info("[TrainingService] Initialized v4.1")
    
    # ==================== Dataset Preparation ====================
    
    async def prepare_dataset(self, filters: Dict, options: Dict) -> Dict:
        """
        Prepare dataset for training (without starting training).
        Delegates to training.dataset module.
        """
        return await _prepare_dataset(self._supabase, filters, options)
    
    # ==================== Training Execution ====================
    
    async def execute_training(
        self,
        mode: str,
        filters: Dict,
        options: Dict
    ) -> str:
        """
        Start model training.
        
        Returns:
            session_id for tracking progress
        """
        logger.info(f"[TrainingService] Starting training in {mode} mode...")
        
        # Create session
        session_id = str(uuid.uuid4())
        session_data = {
            'id': session_id,
            'model_version': options.get('model_version', 'v1.0'),
            'training_mode': mode,
            'faces_count': 0,
            'people_count': 0,
            'context_weight': options['context_weight'],
            'min_faces_per_person': options['min_faces_per_person'],
            'metrics': {},
            'status': 'running'
        }
        
        # v4.1: Use training repository
        self._training.create_training_session(session_data)
        logger.info(f"[TrainingService] Training session created: {session_id}")
        
        return session_id
    
    async def _train_background(
        self,
        session_id: str,
        mode: str,
        filters: Dict,
        options: Dict
    ):
        """
        Background training process with progressive algorithm.
        Optimized: reuses existing embeddings from DB.
        """
        logger.info(f"[TrainingService] Background training started for session {session_id}")
        
        try:
            # Ensure InsightFace is initialized
            self.face_service._ensure_initialized()
            
            self.current_progress = {
                'current': 0,
                'total': 0,
                'step': 'Loading verified faces from database'
            }
            
            # v4.1: Use training repository
            faces = await self._training.get_verified_faces_with_descriptors(
                event_ids=filters.get('event_ids'),
                person_ids=filters.get('person_ids'),
                date_from=filters.get('date_from'),
                date_to=filters.get('date_to'),
                min_faces_per_person=options['min_faces_per_person']
            )
            
            logger.info(f"[TrainingService] Loaded {len(faces)} verified faces")
            
            # Separate faces with/without descriptors
            faces_with_descriptors = []
            faces_without_descriptors = []
            
            for face in faces:
                if face.get('insightface_descriptor'):
                    faces_with_descriptors.append(face)
                else:
                    faces_without_descriptors.append(face)
            
            logger.info(f"[TrainingService] With descriptors: {len(faces_with_descriptors)}")
            logger.info(f"[TrainingService] Without descriptors: {len(faces_without_descriptors)}")
            
            # Collect existing descriptors
            descriptors = []
            person_ids = []
            
            for face in faces_with_descriptors:
                descriptor = np.array(face['insightface_descriptor'])
                descriptors.append(descriptor)
                person_ids.append(face['person_id'])
            
            logger.info(f"[TrainingService] Reused {len(descriptors)} existing descriptors")
            
            # Process faces without descriptors
            if faces_without_descriptors:
                await self._extract_missing_descriptors(
                    session_id,
                    faces_without_descriptors,
                    descriptors,
                    person_ids
                )
            
            logger.info(f"[TrainingService] Total descriptors: {len(descriptors)} from {len(set(person_ids))} people")
            
            # Build HNSW index
            self.current_progress['step'] = 'Building HNSWLIB index'
            
            if mode == 'full':
                self.face_service.players_index = hnswlib.Index(space='cosine', dim=512)
                self.face_service.players_index.init_index(
                    max_elements=10000,
                    ef_construction=200,
                    M=16
                )
                self.face_service.player_ids_map = []
            
            if descriptors:
                start_idx = len(self.face_service.player_ids_map)
                self.face_service.players_index.add_items(
                    np.array(descriptors),
                    list(range(start_idx, start_idx + len(descriptors)))
                )
                self.face_service.player_ids_map.extend(person_ids)
            
            logger.info(f"[TrainingService] Index built with {len(descriptors)} descriptors")
            
            # Save index to disk
            self.current_progress['step'] = 'Saving index to disk'
            await self._save_index()
            
            # Calculate metrics
            self.current_progress['step'] = 'Calculating metrics'
            metrics = await _calculate_metrics(descriptors, person_ids)
            
            # Update session
            updates = {
                'faces_count': len(descriptors),
                'people_count': len(set(person_ids)),
                'metrics': metrics,
                'status': 'completed'
            }
            
            # v4.1: Use training repository
            self._training.update_training_session(session_id, updates)
            
            self.current_progress['step'] = 'Completed'
            logger.info("[TrainingService] Training completed successfully")
            
        except Exception as e:
            logger.error(f"[TrainingService] Training failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            
            self._training.update_training_session(session_id, {
                'status': 'failed',
                'metrics': {'error': str(e)}
            })
    
    async def _extract_missing_descriptors(
        self,
        session_id: str,
        faces_without_descriptors: List[Dict],
        descriptors: List[np.ndarray],
        person_ids: List[str]
    ):
        """Extract descriptors for faces that don't have them yet."""
        self.current_progress['step'] = 'Extracting missing descriptors'
        self.current_progress['total'] = len(faces_without_descriptors)
        
        # Group by photo_id
        photos_to_process = {}
        for face in faces_without_descriptors:
            photo_id = face['photo_id']
            if photo_id not in photos_to_process:
                photos_to_process[photo_id] = []
            photos_to_process[photo_id].append(face)
        
        processed_count = 0
        
        for photo_id, photo_faces in photos_to_process.items():
            self.current_progress['current'] = processed_count
            
            try:
                photo_url = photo_faces[0]['photo_url']
                image = await download_photo(photo_url, supabase_client=self._supabase)
                
                detected_faces = self.face_service.app.get(image)
                
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
                        
                        # v4.1: Use training repository
                        await self._training.update_face_descriptor(
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
    
    async def _save_index(self):
        """Save HNSW index and ID map to disk."""
        models_dir = '/home/nickr/python/models'
        os.makedirs(models_dir, exist_ok=True)
        
        index_path = os.path.join(models_dir, 'players_index.bin')
        map_path = os.path.join(models_dir, 'player_ids_map.json')
        
        self.face_service.players_index.save_index(index_path)
        
        with open(map_path, 'w') as f:
            json.dump(self.face_service.player_ids_map, f)
        
        logger.info(f"Index saved to {index_path}")
        logger.info(f"Player IDs map saved to {map_path}")
    
    # ==================== Status & History ====================
    
    def get_training_status(self, session_id: str) -> Dict:
        """Get training status by session ID."""
        # v4.1: Use training repository
        session = self._training.get_training_session(session_id)
        if not session:
            return {'error': 'Session not found'}
        
        result = {
            'session_id': session_id,
            'status': session['status'],
            'started_at': session['created_at']
        }
        
        if session_id == self.current_session_id and session['status'] == 'running':
            result['progress'] = {
                'current': self.current_progress['current'],
                'total': self.current_progress['total'],
                'percentage': int(
                    (self.current_progress['current'] / self.current_progress['total'] * 100)
                    if self.current_progress['total'] > 0 else 0
                )
            }
            result['current_step'] = self.current_progress['step']
            
            # Estimate completion time
            if self.current_progress['current'] > 0:
                try:
                    elapsed = (datetime.now() - datetime.fromisoformat(session['created_at'])).total_seconds()
                    avg_time = elapsed / self.current_progress['current']
                    remaining = self.current_progress['total'] - self.current_progress['current']
                    estimated = datetime.now() + timedelta(seconds=remaining * avg_time)
                    result['estimated_completion'] = estimated.isoformat()
                except:
                    pass
        
        return result
    
    def get_training_history(self, limit: int = 10, offset: int = 0) -> Dict:
        """Get training history from Supabase."""
        try:
            # v4.1: Use training repository
            sessions = self._training.get_training_history(limit, offset)
            total = self._training.get_training_sessions_count()
            
            return {
                'sessions': sessions,
                'total': total
            }
        except Exception as e:
            logger.error(f"Error getting training history: {e}")
            return {'sessions': [], 'total': 0}
    
    # ==================== Batch Recognition ====================
    
    async def batch_recognize(
        self,
        gallery_ids: Optional[List[str]] = None,
        confidence_threshold: float = 0.60
    ) -> Dict:
        """
        Batch recognition of photos without manual verification.
        Processes only photos where verified = false or NULL.
        
        Args:
            gallery_ids: List of gallery_id to process (None = all)
            confidence_threshold: Threshold for saving result (0-1)
        
        Returns:
            Statistics about recognition results
        """
        logger.info(f"[TrainingService] Starting batch recognition (threshold={confidence_threshold})")
        
        try:
            self.face_service._ensure_initialized()
            
            # Query unverified faces using raw client
            query = self._supabase.client.table("photo_faces").select(
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
                    descriptor = await self._extract_single_descriptor(face_data)
                    if not descriptor:
                        continue
                
                # Recognize
                descriptor_array = np.array(descriptor)
                result = await self.face_service.recognize_face(
                    embedding=descriptor_array,
                    confidence_threshold=confidence_threshold
                )
                
                if result and result[0]:
                    person_id, confidence = result
                    # v4.1: Use faces repository
                    self._faces.update_recognition_result(
                        face_id=face_id,
                        person_id=person_id,
                        recognition_confidence=confidence,
                        verified=False
                    )
                    recognized_count += 1
                    logger.info(f"Recognized face {face_id} as {person_id} ({confidence:.2f})")
                else:
                    self._faces.update_recognition_result(
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
    
    async def _extract_single_descriptor(self, face_data: Dict) -> Optional[np.ndarray]:
        """Extract descriptor for a single face."""
        try:
            photo = face_data.get('gallery_images')
            if not photo:
                return None
            
            photo_url = photo['image_url']
            bbox = face_data['insightface_bbox']
            
            image = await download_photo(photo_url, supabase_client=self._supabase)
            detected_faces = self.face_service.app.get(image)
            
            if not detected_faces:
                return None
            
            best_match, best_iou = match_face_to_detected(bbox, detected_faces)
            
            if best_match and best_iou > 0.3:
                descriptor = best_match.embedding
                
                # v4.1: Use training repository
                await self._training.update_face_descriptor(
                    face_id=face_data['id'],
                    descriptor=descriptor,
                    det_score=float(best_match.det_score),
                    bbox={
                        'x': float(best_match.bbox[0]),
                        'y': float(best_match.bbox[1]),
                        'width': float(best_match.bbox[2] - best_match.bbox[0]),
                        'height': float(best_match.bbox[3] - best_match.bbox[1])
                    },
                    training_context={
                        'batch_recognition': True,
                        'bbox_iou': best_iou
                    }
                )
                
                return descriptor
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to extract descriptor: {e}")
            return None
