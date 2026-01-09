"""
FaceRecognitionService - Facade for face detection and recognition.
Coordinates between InsightFace model, HNSW index, and quality filters.

This is a facade that delegates to specialized modules:
- insightface_model.py - Model initialization
- hnsw_index.py - HNSW index operations
- quality_filters.py - Quality filtering
- grouping.py - Face clustering

v4.0: New recognition algorithm with adaptive early exit
v4.1: Migrated to SupabaseService (modular architecture)
v4.2: Face size filter uses max(width, height)
v5.0: Incremental index operations (add_item, mark_deleted)
      - Reduces full rebuilds by using incremental updates
      - Auto-rebuild when deleted >= 5% or capacity >= 95%
v6.0: Variant C - ALL faces with descriptors in index
      - person_id can be None (unassigned faces)
      - excluded_from_index is metadata, not filter
      - update_metadata() for changing person_id without rebuild
      - Recognition skips faces where person_id is None OR excluded is True
"""

import os
import json
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
        """Load players index from Supabase (full rebuild)"""
        logger.info("[FaceRecognition] Loading players index...")

        try:
            # v6.0: Get ALL embeddings including unassigned faces and excluded flags
            face_ids, person_ids, embeddings, verified_flags, confidences, excluded_flags = self._embeddings.get_all_player_embeddings()

            if len(embeddings) > 0:
                success = self._players_index.load_from_embeddings(
                    person_ids,
                    embeddings,
                    verified_flags,
                    confidences,
                    face_ids,
                    excluded_flags  # v6.0: pass excluded flags
                )

                if success:
                    unique_count = self._players_index.get_unique_people_count()
                    verified_count = self._players_index.get_verified_count()
                    total_count = len(embeddings)
                    with_person = sum(1 for p in person_ids if p is not None)
                    excluded_count = sum(excluded_flags)
                    logger.info(f"[FaceRecognition] Index loaded: {total_count} embeddings "
                               f"({with_person} with person_id, {verified_count} verified, {excluded_count} excluded) "
                               f"for {unique_count} people")
                else:
                    raise ValueError("Failed to build HNSW index")
            else:
                logger.warning("[FaceRecognition] No embeddings found in Supabase")
                raise ValueError("No embeddings found in Supabase")

        except Exception as e:
            logger.error(f"[FaceRecognition] ERROR loading index: {e}")
            raise
    
    async def rebuild_players_index(self) -> Dict:
        """Rebuild the HNSWLIB index from database (full rebuild)"""
        logger.info("[FaceRecognition] Rebuilding players index...")

        try:
            old_count = self._players_index.get_count() if self._players_index.is_loaded() else 0

            self._load_players_index()

            new_count = self._players_index.get_count()
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

    # ==================== Incremental Index Operations (v5.0/v6.0) ====================

    async def add_face_to_index(
        self,
        face_id: str,
        person_id: Optional[str] = None,
        embedding: np.ndarray = None,
        verified: bool = False,
        confidence: float = 0.0,
        excluded: bool = False
    ) -> Dict:
        """
        Add a single face to the index (incremental).
        If embedding not provided, fetches from database.

        v6.0: ALL faces with descriptors go into index.
        - person_id can be None for unassigned faces
        - excluded faces are added with excluded=True in metadata

        Returns:
            Dict with success status and rebuild_triggered flag
        """
        self._ensure_initialized()

        try:
            # Fetch embedding from DB if not provided
            if embedding is None:
                faces = self._embeddings.get_face_embeddings_by_ids([face_id])
                if not faces:
                    return {"success": False, "error": "Face not found"}
                face = faces[0]
                descriptor = face.get("insightface_descriptor")
                if not descriptor:
                    return {"success": False, "error": "No descriptor"}
                if isinstance(descriptor, list):
                    embedding = np.array(descriptor, dtype=np.float32)
                else:
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)

                # Get metadata from DB
                person_id = face.get("person_id")  # Can be None
                verified = face.get("verified", False) or False
                excluded = face.get("excluded_from_index", False) or False
                # v6.0: confidence depends on verified and person_id
                if verified:
                    confidence = 1.0
                elif person_id:
                    confidence = face.get("recognition_confidence") or 0.0
                else:
                    confidence = 0.0

            # Try to add to index
            success = self._players_index.add_item(face_id, person_id, embedding, verified, confidence, excluded)

            # Check if rebuild needed
            rebuild_triggered = False
            if success:
                needs, reason = self._players_index.needs_rebuild()
                if needs:
                    logger.info(f"[FaceRecognition] Rebuild triggered: {reason}")
                    await self.rebuild_players_index()
                    rebuild_triggered = True

            return {"success": success, "rebuild_triggered": rebuild_triggered}

        except Exception as e:
            logger.error(f"[FaceRecognition] Error adding face to index: {e}")
            return {"success": False, "error": str(e)}

    async def add_faces_to_index(self, face_ids: List[str]) -> Dict:
        """
        Add multiple faces to the index (incremental).
        Fetches embeddings from database.

        v6.0: ALL faces with descriptors go into index, including
        those without person_id or with excluded=True.

        Returns:
            Dict with added count and rebuild_triggered flag
        """
        self._ensure_initialized()

        if not face_ids:
            return {"added": 0, "rebuild_triggered": False}

        try:
            # Fetch embeddings from DB
            faces = self._embeddings.get_face_embeddings_by_ids(face_ids)
            if not faces:
                return {"added": 0, "error": "No faces found"}

            added = 0
            skipped_no_descriptor = 0
            for face in faces:
                descriptor = face.get("insightface_descriptor")
                if not descriptor:
                    skipped_no_descriptor += 1
                    continue

                if isinstance(descriptor, list):
                    embedding = np.array(descriptor, dtype=np.float32)
                else:
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)

                # v6.0: Get all metadata, person_id can be None
                person_id = face.get("person_id")
                verified = face.get("verified", False) or False
                excluded = face.get("excluded_from_index", False) or False

                # Confidence logic
                if verified:
                    confidence = 1.0
                elif person_id:
                    confidence = face.get("recognition_confidence") or 0.0
                else:
                    confidence = 0.0

                if self._players_index.add_item(face["id"], person_id, embedding, verified, confidence, excluded):
                    added += 1

            # Check if rebuild needed
            rebuild_triggered = False
            needs, reason = self._players_index.needs_rebuild()
            if needs:
                logger.info(f"[FaceRecognition] Rebuild triggered: {reason}")
                await self.rebuild_players_index()
                rebuild_triggered = True

            logger.info(f"[FaceRecognition] Added {added}/{len(face_ids)} faces to index")
            return {"added": added, "skipped_no_descriptor": skipped_no_descriptor, "rebuild_triggered": rebuild_triggered}

        except Exception as e:
            logger.error(f"[FaceRecognition] Error adding faces to index: {e}")
            return {"added": 0, "error": str(e)}

    async def remove_face_from_index(self, face_id: str) -> Dict:
        """
        Remove a face from the index (mark as deleted).

        Returns:
            Dict with success status and rebuild_triggered flag
        """
        self._ensure_initialized()

        try:
            success = self._players_index.mark_deleted(face_id)

            # Check if rebuild needed
            rebuild_triggered = False
            if success:
                needs, reason = self._players_index.needs_rebuild()
                if needs:
                    logger.info(f"[FaceRecognition] Rebuild triggered: {reason}")
                    await self.rebuild_players_index()
                    rebuild_triggered = True

            return {"success": success, "rebuild_triggered": rebuild_triggered}

        except Exception as e:
            logger.error(f"[FaceRecognition] Error removing face from index: {e}")
            return {"success": False, "error": str(e)}

    async def remove_faces_from_index(self, face_ids: List[str]) -> Dict:
        """
        Remove multiple faces from the index (mark as deleted).

        Returns:
            Dict with deleted count and rebuild_triggered flag
        """
        self._ensure_initialized()

        if not face_ids:
            return {"deleted": 0, "rebuild_triggered": False}

        try:
            deleted = self._players_index.mark_deleted_batch(face_ids)

            # Check if rebuild needed
            rebuild_triggered = False
            needs, reason = self._players_index.needs_rebuild()
            if needs:
                logger.info(f"[FaceRecognition] Rebuild triggered: {reason}")
                await self.rebuild_players_index()
                rebuild_triggered = True

            logger.info(f"[FaceRecognition] Removed {deleted}/{len(face_ids)} faces from index")
            return {"deleted": deleted, "rebuild_triggered": rebuild_triggered}

        except Exception as e:
            logger.error(f"[FaceRecognition] Error removing faces from index: {e}")
            return {"deleted": 0, "error": str(e)}

    async def update_face_metadata(
        self,
        face_id: str,
        person_id: Optional[str] = None,
        verified: Optional[bool] = None,
        confidence: Optional[float] = None,
        excluded: Optional[bool] = None
    ) -> Dict:
        """
        Update metadata for a face WITHOUT rebuilding the index.

        v6.0: Key method for Variant C architecture.
        Use this when person_id, verified, confidence, or excluded changes
        but the embedding itself is unchanged.

        Args:
            face_id: Face to update
            person_id: New person_id (use empty string "" to set to None)
            verified: New verified status
            confidence: New confidence value
            excluded: New excluded status

        Returns:
            Dict with success status
        """
        self._ensure_initialized()

        try:
            success = self._players_index.update_metadata(
                face_id,
                person_id=person_id,
                verified=verified,
                confidence=confidence,
                excluded=excluded
            )

            if success:
                logger.info(f"[FaceRecognition] Updated metadata for face {face_id[:8]}...")
            else:
                logger.warning(f"[FaceRecognition] Face {face_id} not found in index for metadata update")

            return {"success": success}

        except Exception as e:
            logger.error(f"[FaceRecognition] Error updating face metadata: {e}")
            return {"success": False, "error": str(e)}

    def get_index_stats(self) -> Dict:
        """Get current index statistics."""
        return self._players_index.get_stats()

    def check_rebuild_needed(self) -> Tuple[bool, str]:
        """Check if index needs rebuilding."""
        return self._players_index.needs_rebuild()

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

        v6.0: Skip faces where person_id is None OR excluded is True.
        These faces are in the index for embedding lookup but should not
        contribute to recognition results.

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

        logger.info(f"[v6.0] Recognizing face (threshold={confidence_threshold:.2f})")

        # Safety check
        if not self._players_index.is_loaded():
            logger.warning("[v6.0] Index not loaded, attempting to initialize...")
            try:
                self._load_players_index()
            except Exception as e:
                logger.error(f"[v6.0] Cannot initialize index: {e}")
                return None, None

        # Query with safety margin - we'll exit early anyway
        max_k = min(50, self._players_index.get_count())
        person_ids, similarities, verified_flags, source_confidences, excluded_flags = self._players_index.query(embedding, k=max_k)

        if not person_ids:
            logger.info("[v6.0] No candidates found in index")
            return None, None

        # Adaptive search with early exit
        best_person_id = None
        best_final_confidence = 0.0
        iterations = 0
        skipped = 0

        for i in range(len(person_ids)):
            person_id = person_ids[i]
            similarity = similarities[i]
            source_conf = source_confidences[i]
            is_verified = verified_flags[i]
            is_excluded = excluded_flags[i]

            iterations += 1

            # v6.0: Skip faces without person_id or excluded from recognition
            # These are in the index but should not contribute to recognition
            if person_id is None or is_excluded:
                skipped += 1
                continue

            # Early exit condition: similarity < best means no future candidate can win
            # Because: future_final = future_conf × future_sim ≤ 1.0 × future_sim ≤ similarity < best
            if similarity < best_final_confidence:
                logger.info(f"[v6.0] Early exit at iteration {iterations}: sim={similarity:.3f} < best={best_final_confidence:.3f}")
                break

            # Calculate final confidence
            final_confidence = source_conf * similarity

            # Update best if improved
            if final_confidence > best_final_confidence:
                best_final_confidence = final_confidence
                best_person_id = person_id
                v_marker = "✓" if is_verified else "○"
                logger.info(f"[v6.0] [{iterations}] {v_marker} New best: person={person_id[:8]}..., sim={similarity:.3f} × conf={source_conf:.3f} = {final_confidence:.3f}")

        logger.info(f"[v6.0] Search complete: {iterations} iterations, {skipped} skipped, best={best_final_confidence:.3f}")

        # Check threshold
        if best_final_confidence >= confidence_threshold:
            logger.info(f"[v6.0] ✓ Match accepted: person={best_person_id}, confidence={best_final_confidence:.3f}")
            return best_person_id, best_final_confidence
        else:
            logger.info(f"[v6.0] ✗ Below threshold: {best_final_confidence:.3f} < {confidence_threshold:.3f}")
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
