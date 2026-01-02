"""
HNSW index management for face recognition.
Handles loading, building, and querying the players index.

v5.0: Incremental operations support
- add_item() for single face additions
- mark_deleted() for face removals
- Automatic rebuild triggers (5% deleted, 95% capacity)
"""

import numpy as np
import hnswlib
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Rebuild thresholds
DELETED_THRESHOLD = 0.05  # 5% deleted triggers rebuild
CAPACITY_THRESHOLD = 0.95  # 95% capacity triggers rebuild
CAPACITY_BUFFER = 0.10  # 10% buffer when creating index


class HNSWIndex:
    """
    Wrapper for HNSWLIB index operations.
    Manages the players index for face recognition.

    v5.0: Supports incremental operations:
    - add_item/add_items for adding faces
    - mark_deleted for removing faces
    - Automatic rebuild when deleted >= 5% or capacity >= 95%

    Stores verified status and confidence for each embedding to support
    confidence chain multiplication for non-verified matches.
    """

    def __init__(self):
        self.index: Optional[hnswlib.Index] = None
        self.ids_map: List[str] = []  # label → person_id
        self.verified_map: List[bool] = []  # label → verified status
        self.confidence_map: List[float] = []  # label → recognition_confidence
        self.face_id_map: List[str] = []  # label → face_id (for incremental ops)
        self.face_id_to_label: Dict[str, int] = {}  # face_id → label (reverse lookup)
        self.dim: int = 512  # InsightFace embedding dimension
        self.next_label: int = 0  # Next label to assign
        self.deleted_count: int = 0  # Count of deleted items
        self.max_elements: int = 0  # Current capacity
        self.last_rebuild_time: Optional[datetime] = None  # When index was last rebuilt
    
    def is_loaded(self) -> bool:
        """Check if index is loaded and has items"""
        return self.index is not None and len(self.ids_map) > 0
    
    def get_count(self) -> int:
        """Get number of items in index"""
        if self.index is None:
            return 0
        return self.index.get_current_count()
    
    def get_unique_people_count(self) -> int:
        """Get number of unique people in index"""
        return len(set(self.ids_map)) if self.ids_map else 0
    
    def get_verified_count(self) -> int:
        """Get number of verified embeddings in index"""
        return sum(1 for v in self.verified_map if v)
    
    def load_from_embeddings(
        self,
        person_ids: List[str],
        embeddings: List[np.ndarray],
        verified_flags: List[bool] = None,
        confidences: List[float] = None,
        face_ids: List[str] = None,
        ef_construction: int = 200,
        M: int = 16,
        ef_search: int = 50
    ) -> bool:
        """
        Build index from embeddings (full rebuild).

        Args:
            person_ids: List of person IDs corresponding to embeddings
            embeddings: List of 512-dim embeddings
            verified_flags: List of verified status (True/False) for each embedding
            confidences: List of recognition_confidence for each embedding
            face_ids: List of face IDs for incremental operations (optional)
            ef_construction: HNSW construction parameter
            M: HNSW M parameter (number of connections)
            ef_search: HNSW search parameter

        Returns:
            True if successful
        """
        if len(embeddings) == 0:
            logger.warning("No embeddings provided for index")
            return False

        # Default to all verified with confidence 1.0 if not provided (backward compatibility)
        if verified_flags is None:
            verified_flags = [True] * len(embeddings)
        if confidences is None:
            confidences = [1.0] * len(embeddings)
        if face_ids is None:
            face_ids = [f"unknown_{i}" for i in range(len(embeddings))]

        try:
            dim = len(embeddings[0])
            self.dim = dim

            # Calculate capacity with buffer (10% extra)
            num_elements = len(embeddings)
            self.max_elements = int(num_elements * (1 + CAPACITY_BUFFER))

            # Create index
            self.index = hnswlib.Index(space='cosine', dim=dim)
            self.index.init_index(
                max_elements=self.max_elements,
                ef_construction=ef_construction,
                M=M
            )

            # Add embeddings with sequential labels
            embeddings_array = np.array(embeddings)
            labels = np.arange(num_elements)
            self.index.add_items(embeddings_array, labels)
            self.index.set_ef(ef_search)

            # Store mappings
            self.ids_map = list(person_ids)
            self.verified_map = list(verified_flags)
            self.confidence_map = list(confidences)
            self.face_id_map = list(face_ids)

            # Build reverse lookup
            self.face_id_to_label = {fid: i for i, fid in enumerate(face_ids)}
            self.next_label = num_elements
            self.deleted_count = 0
            self.last_rebuild_time = datetime.now()

            unique_people = len(set(person_ids))
            verified_count = sum(1 for v in verified_flags if v)
            logger.info(f"HNSW index built: {num_elements} embeddings ({verified_count} verified) "
                       f"for {unique_people} people, capacity={self.max_elements}")

            return True

        except Exception as e:
            logger.error(f"Error building HNSW index: {e}")
            return False

    # ==================== Incremental Operations ====================

    def add_item(
        self,
        face_id: str,
        person_id: str,
        embedding: np.ndarray,
        verified: bool = False,
        confidence: float = 1.0
    ) -> bool:
        """
        Add a single face to the index.

        Args:
            face_id: Unique face identifier
            person_id: Person this face belongs to
            embedding: 512-dim face embedding
            verified: Whether this face is verified
            confidence: Recognition confidence

        Returns:
            True if successful
        """
        if not self.is_loaded():
            logger.warning("Index not loaded, cannot add item")
            return False

        # Check if face already in index
        if face_id in self.face_id_to_label:
            logger.debug(f"Face {face_id} already in index, skipping")
            return True

        # Check capacity
        active_count = self.get_count()
        if active_count >= self.max_elements:
            logger.warning(f"Index at capacity ({active_count}/{self.max_elements}), need rebuild")
            return False

        try:
            label = self.next_label
            self.next_label += 1

            # Ensure maps are long enough
            while len(self.ids_map) <= label:
                self.ids_map.append("")
                self.verified_map.append(False)
                self.confidence_map.append(0.0)
                self.face_id_map.append("")

            # Store mappings
            self.ids_map[label] = person_id
            self.verified_map[label] = verified
            self.confidence_map[label] = confidence
            self.face_id_map[label] = face_id
            self.face_id_to_label[face_id] = label

            # Add to HNSW
            self.index.add_items(embedding.reshape(1, -1), np.array([label]))

            logger.debug(f"Added face {face_id[:8]}... as label {label}")
            return True

        except Exception as e:
            logger.error(f"Error adding item: {e}")
            return False

    def add_items(
        self,
        face_ids: List[str],
        person_ids: List[str],
        embeddings: List[np.ndarray],
        verified_flags: List[bool] = None,
        confidences: List[float] = None
    ) -> int:
        """
        Add multiple faces to the index.

        Returns:
            Number of items successfully added
        """
        if not self.is_loaded():
            logger.warning("Index not loaded, cannot add items")
            return 0

        if verified_flags is None:
            verified_flags = [False] * len(face_ids)
        if confidences is None:
            confidences = [1.0] * len(face_ids)

        added = 0
        for i, face_id in enumerate(face_ids):
            if self.add_item(face_id, person_ids[i], embeddings[i],
                           verified_flags[i], confidences[i]):
                added += 1

        logger.info(f"Added {added}/{len(face_ids)} items to index")
        return added

    def mark_deleted(self, face_id: str) -> bool:
        """
        Mark a face as deleted in the index.

        Args:
            face_id: Face ID to mark as deleted

        Returns:
            True if successfully marked
        """
        if not self.is_loaded():
            return False

        label = self.face_id_to_label.get(face_id)
        if label is None:
            logger.debug(f"Face {face_id} not in index, nothing to delete")
            return True  # Already not in index

        try:
            self.index.mark_deleted(label)
            del self.face_id_to_label[face_id]
            self.deleted_count += 1

            logger.debug(f"Marked face {face_id[:8]}... (label {label}) as deleted")
            return True

        except Exception as e:
            logger.error(f"Error marking deleted: {e}")
            return False

    def mark_deleted_batch(self, face_ids: List[str]) -> int:
        """
        Mark multiple faces as deleted.

        Returns:
            Number of items successfully marked
        """
        if not face_ids:
            return 0

        deleted = 0
        for face_id in face_ids:
            if self.mark_deleted(face_id):
                deleted += 1

        logger.info(f"Marked {deleted}/{len(face_ids)} items as deleted")
        return deleted

    def needs_rebuild(self) -> Tuple[bool, str]:
        """
        Check if index needs rebuilding.

        Returns:
            Tuple of (needs_rebuild, reason)
        """
        if not self.is_loaded():
            return False, "not_loaded"

        # Check deleted threshold (5%)
        if self.max_elements > 0:
            deleted_ratio = self.deleted_count / self.max_elements
            if deleted_ratio >= DELETED_THRESHOLD:
                return True, f"deleted={deleted_ratio:.1%} >= {DELETED_THRESHOLD:.0%}"

        # Check capacity threshold (95%)
        active_count = self.get_count()
        if self.max_elements > 0:
            capacity_ratio = active_count / self.max_elements
            if capacity_ratio >= CAPACITY_THRESHOLD:
                return True, f"capacity={capacity_ratio:.1%} >= {CAPACITY_THRESHOLD:.0%}"

        return False, "ok"

    def get_stats(self) -> Dict[str, Any]:
        """Get index statistics."""
        active_count = self.get_count() if self.is_loaded() else 0
        return {
            "loaded": self.is_loaded(),
            "active_count": active_count,
            "deleted_count": self.deleted_count,
            "max_elements": self.max_elements,
            "unique_people": self.get_unique_people_count(),
            "verified_count": self.get_verified_count(),
            "capacity_used": f"{(active_count / self.max_elements * 100):.1f}%" if self.max_elements > 0 else "0%",
            "deleted_ratio": f"{(self.deleted_count / self.max_elements * 100):.1f}%" if self.max_elements > 0 else "0%"
        }
    
    def query(
        self,
        embedding: np.ndarray,
        k: int = 1
    ) -> Tuple[List[str], List[float], List[bool], List[float]]:
        """
        Query index for nearest neighbors.
        
        Args:
            embedding: Query embedding (512-dim)
            k: Number of neighbors to return
            
        Returns:
            Tuple of (person_ids, similarities, verified_flags, source_confidences)
            Similarities are converted from cosine distance (1 - distance)
        """
        if not self.is_loaded():
            logger.warning("Index not loaded, cannot query")
            return [], [], [], []
        
        try:
            # Ensure k doesn't exceed index size
            k = min(k, self.get_count())
            
            labels, distances = self.index.knn_query(
                embedding.reshape(1, -1),
                k=k
            )
            
            # Convert to person IDs, similarities, and metadata
            person_ids = [self.ids_map[int(idx)] for idx in labels[0]]
            similarities = [1.0 - float(d) for d in distances[0]]
            verified_flags = [self.verified_map[int(idx)] for idx in labels[0]]
            source_confidences = [self.confidence_map[int(idx)] for idx in labels[0]]
            
            return person_ids, similarities, verified_flags, source_confidences
            
        except Exception as e:
            logger.error(f"Error querying HNSW index: {e}")
            return [], [], [], []
    
    def query_raw(
        self,
        embedding: np.ndarray,
        k: int = 1
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Query index and return raw labels/distances.
        For backward compatibility with existing code.
        
        Args:
            embedding: Query embedding (512-dim)
            k: Number of neighbors to return
            
        Returns:
            Tuple of (labels, distances) arrays
        """
        if not self.is_loaded():
            return np.array([[]]), np.array([[]])
        
        k = min(k, self.get_count())
        return self.index.knn_query(embedding.reshape(1, -1), k=k)


class TournamentIndex:
    """
    Temporary HNSW index for tournament/session face grouping.
    Separate from the main players index.
    """
    
    def __init__(self):
        self.indices: Dict[str, hnswlib.Index] = {}
    
    def build(
        self,
        tournament_id: str,
        embeddings: List[np.ndarray]
    ) -> bool:
        """
        Build temporary index for a tournament.
        
        Args:
            tournament_id: Tournament/session identifier
            embeddings: List of face embeddings
            
        Returns:
            True if successful
        """
        if len(embeddings) == 0:
            return False
        
        try:
            dim = len(embeddings[0])
            num_elements = len(embeddings)
            
            index = hnswlib.Index(space='cosine', dim=dim)
            index.init_index(
                max_elements=num_elements * 2,
                ef_construction=200,
                M=16
            )
            
            embeddings_array = np.array(embeddings)
            index.add_items(embeddings_array, np.arange(num_elements))
            index.set_ef(50)
            
            self.indices[tournament_id] = index
            logger.info(f"Tournament index built for {tournament_id}: {num_elements} faces")
            
            return True
            
        except Exception as e:
            logger.error(f"Error building tournament index: {e}")
            return False
    
    def get(self, tournament_id: str) -> Optional[hnswlib.Index]:
        """Get index for tournament"""
        return self.indices.get(tournament_id)
    
    def clear(self, tournament_id: str = None):
        """Clear tournament index(es)"""
        if tournament_id:
            self.indices.pop(tournament_id, None)
        else:
            self.indices.clear()
