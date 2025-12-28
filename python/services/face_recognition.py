"""
FaceRecognitionService - Facade for face detection and recognition.
Coordinates between InsightFace model, HNSW index, and quality filters.

This is a facade that delegates to specialized modules:
- insightface_model.py - Model initialization
- hnsw_index.py - HNSW index operations
- quality_filters.py - Quality filtering
- grouping.py - Face clustering

v4.0: New recognition algorithm with adaptive early exit
- Formula: final_confidence = source_confidence × similarity
- Early exit when similarity < best_final_confidence
- No separate penalty for non-verified faces

v4.1: Migrated to SupabaseService (modular architecture)
v4.2: Face size filter uses max(width, height)
"""

import os
import numpy as np
from typing import List, Tuple, Optional, Dict, Any, Union
from datetime import datetime
import uuid
import io
from PIL import Image
import cv2

from fastapi import UploadFile

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import specialized modules
from services.insightface_model import InsightFaceModel, get_model
from services.hnsw_index import HNSWIndex, TournamentIndex
from services.quality_filters import (
    calculate_blur_score,
    passes_quality_filters,
    DEFAULT_QUALITY_FILTERS
)
from services.grouping import group_tournament_faces

# New modular Supabase service
from services.supabase import SupabaseService, get_supabase_service


class FaceRecognitionService:
    """
    Facade for face detection and recognition.
    Coordinates model, index, and quality filtering.
    
    v4.1: Now uses SupabaseService with modular repositories.
    v4.2: Face size uses max(width, height) for filtering.
    """
    
    def __init__(self, supabase_service: Optional['SupabaseService'] = None, supabase_db=None):
        """
        Initialize the service with dependencies.
        
        Args:
            supabase_service: New SupabaseService instance (preferred)
            supabase_db: Legacy SupabaseDatabase (deprecated, for backward compatibility)
        """
        logger.info("[FaceRecognition] Initializing FaceRecognitionService v4.2...")
        
        # Use new SupabaseService or create one
        if supabase_service is not None:
            self._supabase = supabase_service
        elif supabase_db is not None:
            # Legacy: wrap old SupabaseDatabase in compatibility layer
            logger.warning("[FaceRecognition] Using legacy supabase_db - please migrate to SupabaseService")
            self._supabase = get_supabase_service()
            # Keep reference for methods that might use legacy API
            self._legacy_db = supabase_db
        else:
            self._supabase = get_supabase_service()
        
        # Shortcut accessors to repositories
        self._embeddings = self._supabase.embeddings
        self._config = self._supabase.config
        self._faces = self._supabase.faces
        self._people = self._supabase.people
        
        # Legacy compatibility alias
        self.supabase_db = self._supabase
        
        logger.info("[FaceRecognition] SupabaseService connected")
        
        # InsightFace model (lazy initialization)
        self._model = InsightFaceModel()
        
        # HNSW indices
        self._players_index = HNSWIndex()
        self._tournament_index = TournamentIndex()
        
        # Legacy compatibility: direct access to index
        self.players_index = None  # Will be set after loading
        self.player_ids_map = []
        
        # Quality filters
        self.quality_filters = DEFAULT_QUALITY_FILTERS.copy()
        
        # Temporary storage for tournament processing
        self.embeddings_store: Dict[str, List[np.ndarray]] = {}
        self.faces_data_store: Dict[str, List[Dict]] = {}
        self.index_store: Dict[str, Any] = {}
        
        logger.info("[FaceRecognition] FaceRecognitionService created (awaiting initialization)")
    
    # ==================== Model Initialization ====================
    
    @property
    def app(self):
        """Legacy access to InsightFace app"""
        return self._model.app
    
    def _ensure_initialized(self):
        """Lazy initialization of InsightFace model"""
        if not self._model.is_ready:
            self._model.initialize()
            self._load_players_index()
    
    def _ensure_model_unpacked(self):
        """Legacy method - delegates to model"""
        return self._model._ensure_model_unpacked()
    
    def is_ready(self) -> bool:
        """Check if service is ready"""
        self._ensure_initialized()
        return self._model.is_ready
    
    # ==================== Index Operations ====================
    
    def _load_players_index(self):
        """Load players index from Supabase"""
        logger.info("[FaceRecognition] Loading players index...")
        
        try:
            # Get ALL embeddings (verified and non-verified) with metadata
            # v4.1: Use embeddings repository
            person_ids, embeddings, verified_flags, confidences = self._embeddings.get_all_player_embeddings()
            
            if len(embeddings) > 0:
                success = self._players_index.load_from_embeddings(
                    person_ids, 
                    embeddings,
                    verified_flags,
                    confidences
                )
                
                if success:
                    # Legacy compatibility
                    self.players_index = self._players_index.index
                    self.player_ids_map = self._players_index.ids_map
                    
                    unique_count = self._players_index.get_unique_people_count()
                    verified_count = self._players_index.get_verified_count()
                    total_count = len(embeddings)
                    logger.info(f"[FaceRecognition] Index loaded: {total_count} embeddings ({verified_count} verified) for {unique_count} people")
                else:
                    raise ValueError("Failed to build HNSW index")
            else:
                logger.warning("[FaceRecognition] No embeddings found in Supabase")
                raise ValueError("No embeddings found in Supabase")
                
        except Exception as e:
            logger.error(f"[FaceRecognition] ERROR loading index: {e}")
            raise
    
    async def rebuild_players_index(self) -> Dict:
        """Rebuild the HNSWLIB index from database"""
        logger.info("[FaceRecognition] Rebuilding players index...")
        
        try:
            old_count = len(self.player_ids_map) if self.player_ids_map else 0
            
            self._load_players_index()
            
            new_count = len(self.player_ids_map) if self.player_ids_map else 0
            unique_people = self._players_index.get_unique_people_count()
            verified_count = self._players_index.get_verified_count()
            
            logger.info(f"[FaceRecognition] Index rebuilt: {old_count} -> {new_count} descriptors ({verified_count} verified)")
            
            return {
                "success": True,
                "old_descriptor_count": old_count,
                "new_descriptor_count": new_count,
                "verified_count": verified_count,
                "unique_people_count": unique_people
            }
            
        except Exception as e:
            logger.error(f"[FaceRecognition] ERROR rebuilding index: {e}")
            return {"success": False, "error": str(e)}
    
    async def _build_hnsw_index(self, tournament_id: str):
        """Build temporary HNSW index for tournament"""
        embeddings = self.embeddings_store.get(tournament_id, [])
        if embeddings:
            self._tournament_index.build(tournament_id, embeddings)
            self.index_store[tournament_id] = self._tournament_index.get(tournament_id)
    
    # ==================== Face Detection ====================
    
    async def detect_faces(
        self, 
        image_url: str, 
        apply_quality_filters: bool = True,
        min_detection_score: Optional[float] = None,
        min_face_size: Optional[float] = None,
        min_blur_score: Optional[float] = None
    ) -> List[Dict]:
        """
        Detect faces on an image from URL with optional quality filtering.
        """
        self._ensure_initialized()
        
        # Prepare filters
        filters = self.quality_filters.copy()
        if min_detection_score is not None:
            filters["min_detection_score"] = min_detection_score
        if min_face_size is not None:
            filters["min_face_size"] = min_face_size
        if min_blur_score is not None:
            filters["min_blur_score"] = min_blur_score
        
        if apply_quality_filters:
            logger.info(f"[FaceRecognition] detect_faces with filters: {filters}")
        
        try:
            # Download image
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url, timeout=30.0)
                response.raise_for_status()
                image_bytes = response.content
            
            logger.info(f"[FaceRecognition] Downloaded {len(image_bytes)} bytes")
            
            # Process image
            image = Image.open(io.BytesIO(image_bytes))
            img_array = np.array(image.convert('RGB'))
            img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            
            # Detect faces
            faces = self._model.get_faces(img_array)
            logger.info(f"[FaceRecognition] Detected {len(faces)} faces before filtering")
            
            results = []
            filtered_count = 0
            
            for idx, face in enumerate(faces):
                # Calculate blur score
                blur_score = calculate_blur_score(img_array, face.bbox)
                
                if apply_quality_filters:
                    passes, reason = passes_quality_filters(
                        face.det_score,
                        face.bbox,
                        blur_score,
                        filters
                    )
                    
                    # v4.2: Use max side for logging (consistent with filter)
                    face_size = max(face.bbox[2] - face.bbox[0], face.bbox[3] - face.bbox[1])
                    logger.info(f"[FaceRecognition] Face {idx+1}: det={face.det_score:.3f}, size={face_size:.0f}px, blur={blur_score:.1f} - {reason}")
                    
                    if not passes:
                        filtered_count += 1
                        continue
                
                results.append({
                    "bbox": face.bbox,
                    "det_score": face.det_score,
                    "blur_score": blur_score,
                    "embedding": face.embedding
                })
            
            logger.info(f"[FaceRecognition] After filtering: {len(results)} kept, {filtered_count} filtered")
            return results
            
        except Exception as e:
            logger.error(f"[FaceRecognition] ERROR in detect_faces: {e}")
            raise
    
    # ==================== Face Recognition ====================
    
    async def recognize_face(
        self,
        embedding: np.ndarray,
        confidence_threshold: Optional[float] = None
    ) -> Tuple[Optional[str], Optional[float]]:
        """
        Recognize face by embedding using adaptive early exit algorithm.
        
        Algorithm (v4.0):
        1. Query HNSW for candidates sorted by similarity (descending)
        2. For each candidate: final_confidence = source_confidence × similarity
        3. Track best_final_confidence
        4. Early exit when: similarity < best_final_confidence
           (no subsequent candidate can improve the result)
        
        This naturally handles:
        - Verified faces (source_conf=1.0) get higher scores
        - Non-verified faces get proportionally lower scores
        - Identical descriptors: iterates until finds best (e.g., verified)
        - Confidence chains decay naturally through multiplication
        
        Returns:
            Tuple of (person_id, final_confidence) or (None, None) if below threshold
        """
        self._ensure_initialized()
        
        if confidence_threshold is None:
            # v4.1: Use config repository
            config = self._config.get_recognition_config()
            confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.60)
        
        logger.info(f"[v4.0] Recognizing face (threshold={confidence_threshold:.2f})")
        
        # Safety check
        if not self._players_index.is_loaded():
            logger.warning("[v4.0] Index not loaded, attempting to initialize...")
            try:
                self._load_players_index()
            except Exception as e:
                logger.error(f"[v4.0] Cannot initialize index: {e}")
                return None, None
        
        # Query with safety margin - we'll exit early anyway
        max_k = min(50, self._players_index.get_count())
        person_ids, similarities, verified_flags, source_confidences = self._players_index.query(embedding, k=max_k)
        
        if not person_ids:
            logger.info("[v4.0] No candidates found in index")
            return None, None
        
        # Adaptive search with early exit
        best_person_id = None
        best_final_confidence = 0.0
        iterations = 0
        
        for i in range(len(person_ids)):
            person_id = person_ids[i]
            similarity = similarities[i]
            source_conf = source_confidences[i]
            is_verified = verified_flags[i]
            
            iterations += 1
            
            # Early exit condition: similarity < best means no future candidate can win
            # Because: future_final = future_conf × future_sim ≤ 1.0 × future_sim ≤ similarity < best
            if similarity < best_final_confidence:
                logger.info(f"[v4.0] Early exit at iteration {iterations}: sim={similarity:.3f} < best={best_final_confidence:.3f}")
                break
            
            # Calculate final confidence
            final_confidence = source_conf * similarity
            
            # Update best if improved
            if final_confidence > best_final_confidence:
                best_final_confidence = final_confidence
                best_person_id = person_id
                v_marker = "✓" if is_verified else "○"
                logger.info(f"[v4.0] [{iterations}] {v_marker} New best: person={person_id[:8]}..., sim={similarity:.3f} × conf={source_conf:.3f} = {final_confidence:.3f}")
        
        logger.info(f"[v4.0] Search complete: {iterations} iterations, best={best_final_confidence:.3f}")
        
        # Check threshold
        if best_final_confidence >= confidence_threshold:
            logger.info(f"[v4.0] ✓ Match accepted: person={best_person_id}, confidence={best_final_confidence:.3f}")
            return best_person_id, best_final_confidence
        else:
            logger.info(f"[v4.0] ✗ Below threshold: {best_final_confidence:.3f} < {confidence_threshold:.3f}")
            return None, None
    
    # ==================== Quality Filters ====================
    
    def calculate_blur_score(self, image: np.ndarray, bbox: List[float]) -> float:
        """Calculate blur score - delegates to module"""
        return calculate_blur_score(image, bbox)
    
    def passes_quality_filters(
        self, 
        det_score: float, 
        bbox: List[float], 
        blur_score: float
    ) -> Tuple[bool, str]:
        """Check quality filters - delegates to module"""
        return passes_quality_filters(det_score, bbox, blur_score, self.quality_filters)
    
    async def load_quality_filters(self):
        """Load quality filters from database config"""
        try:
            # v4.1: Use config repository
            config = self._config.get_recognition_config()
            if 'quality_filters' in config:
                self.quality_filters = config['quality_filters']
                logger.info(f"[FaceRecognition] Quality filters loaded: {self.quality_filters}")
        except Exception as e:
            logger.error(f"[FaceRecognition] Error loading quality filters: {e}")
    
    async def update_quality_filters(self, filters: Dict):
        """Update quality filters in database and cache"""
        try:
            # v4.1: Use config repository
            self._config.update_recognition_config({"quality_filters": filters})
            self.quality_filters = filters
            logger.info(f"[FaceRecognition] Quality filters updated: {filters}")
        except Exception as e:
            logger.error(f"[FaceRecognition] Error updating quality filters: {e}")
            raise
    
    # ==================== Face Grouping ====================
    
    async def group_faces(
        self, 
        tournament_id: Optional[str],
        min_cluster_size: int = 3
    ) -> Tuple[List[Dict], List[Dict]]:
        """Group faces using HDBSCAN clustering"""
        logger.info(f"[FaceRecognition] group_faces: tournament_id={tournament_id}")
        
        if not tournament_id or tournament_id not in self.embeddings_store:
            logger.error(f"[FaceRecognition] Tournament not found: {tournament_id}")
            raise ValueError("Tournament not found or no data for clustering")
        
        embeddings = self.embeddings_store[tournament_id]
        faces_data = self.faces_data_store[tournament_id]
        
        groups, ungrouped = await group_tournament_faces(
            embeddings, faces_data, min_cluster_size
        )
        
        # Store ungrouped for later
        self.faces_data_store[f"{tournament_id}_ungrouped"] = ungrouped
        
        return groups, ungrouped
    
    # ==================== Pipeline Methods ====================
    
    async def process_uploaded_photos(
        self, 
        files: List[UploadFile], 
        tournament_id: Optional[str]
    ) -> List[Dict]:
        """Process uploaded photos and extract faces"""
        logger.info(f"[FaceRecognition] process_uploaded_photos: {len(files)} files")
        
        self._ensure_initialized()
        
        if not tournament_id:
            tournament_id = str(uuid.uuid4())
        
        all_faces = []
        embeddings = []
        
        for idx, file in enumerate(files):
            logger.info(f"[FaceRecognition] Processing file {idx+1}/{len(files)}: {file.filename}")
            
            try:
                contents = await file.read()
                image = Image.open(io.BytesIO(contents))
                img_array = np.array(image.convert('RGB'))
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                
                faces = self._model.get_faces(img_array)
                logger.info(f"[FaceRecognition] Detected {len(faces)} faces")
                
                for face in faces:
                    face_id = str(uuid.uuid4())
                    face_data = {
                        "face_id": face_id,
                        "image_name": file.filename,
                        "bbox": [float(x) for x in face.bbox],
                        "confidence": float(face.det_score),
                        "embedding": face.embedding.tolist()
                    }
                    all_faces.append(face_data)
                    embeddings.append(face.embedding)
                    
            except Exception as e:
                logger.error(f"[FaceRecognition] ERROR processing {file.filename}: {e}")
                continue
        
        # Store for later grouping
        if tournament_id not in self.embeddings_store:
            self.embeddings_store[tournament_id] = []
            self.faces_data_store[tournament_id] = []
        
        self.embeddings_store[tournament_id].extend(embeddings)
        self.faces_data_store[tournament_id].extend(all_faces)
        
        await self._build_hnsw_index(tournament_id)
        
        logger.info(f"[FaceRecognition] Returning {len(all_faces)} faces")
        return all_faces
    
    async def clear_tournament_data(self, tournament_id: Optional[str] = None):
        """Clear tournament data"""
        if tournament_id:
            self.embeddings_store.pop(tournament_id, None)
            self.faces_data_store.pop(tournament_id, None)
            self.index_store.pop(tournament_id, None)
            self._tournament_index.clear(tournament_id)
            logger.info(f"[FaceRecognition] Tournament {tournament_id} data cleared")
        else:
            self.embeddings_store.clear()
            self.faces_data_store.clear()
            self.index_store.clear()
            self._tournament_index.clear()
            logger.info("[FaceRecognition] All tournament data cleared")
