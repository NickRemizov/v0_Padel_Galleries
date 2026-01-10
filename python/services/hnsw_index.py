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

    v6.0: All faces in index:
    - Faces without person_id are in index (person_id can be None)
    - excluded_map tracks excluded_from_index status
    - update_metadata() for changing person_id/verified/confidence/excluded without rebuild
    - Recognition skips faces where person_id is None OR excluded is True

    Stores verified status and confidence for each embedding to support
    confidence chain multiplication for non-verified matches.
    """

    def __init__(self):
        self.index: Optional[hnswlib.Index] = None
        self.ids_map: List[Optional[str]] = []  # label → person_id (can be None)
        self.verified_map: List[bool] = []  # label → verified status
        self.confidence_map: List[float] = []  # label → recognition_confidence
        self.excluded_map: List[bool] = []  # label → excluded_from_index (v6.0)
        self.face_id_map: List[str] = []  # label → face_id (for incremental ops)
        self.face_id_to_label: Dict[str, int] = {}  # face_id → label (reverse lookup)
        self.dim: int = 512  # InsightFace embedding dimension
        self.next_label: int = 0  # Next label to assign
        self.deleted_count: int = 0  # Count of deleted items
        self.max_elements: int = 0  # Current capacity
        self.last_rebuild_time: Optional[datetime] = None  # When index was last rebuilt
    
    def is_loaded(self) -> bool:
        """Check if index is loaded (may be empty)"""
        return self.index is not None

    def initialize_empty(
        self,
        initial_capacity: int = 1000,
        ef_construction: int = 200,
        M: int = 16,
        ef_search: int = 50
    ) -> bool:
        """
        Initialize an empty index for incremental additions.

        v6.1: Used when database has no embeddings yet.
        """
        try:
            self.index = hnswlib.Index(space='cosine', dim=self.dim)
            self.index.init_index(
                max_elements=initial_capacity,
                ef_construction=ef_construction,
                M=M
            )
            self.index.set_ef(ef_search)

            self.max_elements = initial_capacity
            self.ids_map = []
            self.verified_map = []
            self.confidence_map = []
            self.excluded_map = []
            self.face_id_map = []
            self.face_id_to_label = {}
            self.next_label = 0
            self.deleted_count = 0
            self.last_rebuild_time = datetime.now()

            logger.info(f"Empty HNSW index initialized with capacity={initial_capacity}")
            return True

        except Exception as e:
            logger.error(f"Error initializing empty index: {e}")
            return False

    def get_count(self) -> int:
        """Get number of items in index"""
        if self.index is None:
            return 0
        return self.index.get_current_count()
    
    def get_unique_people_count(self) -> int:
        """Get number of unique people in index (excludes None/unassigned faces)"""
        if not self.ids_map:
            return 0
        return len(set(pid for pid in self.ids_map if pid is not None))
    
    def get_verified_count(self) -> int:
        """Get number of verified embeddings in index"""
        return sum(1 for v in self.verified_map if v)
    
    def load_from_embeddings(
        self,
        person_ids: List[Optional[str]],
        embeddings: List[np.ndarray],
        verified_flags: List[bool] = None,
        confidences: List[float] = None,
        face_ids: List[str] = None,
        excluded_flags: List[bool] = None,
        ef_construction: int = 200,
        M: int = 16,
        ef_search: int = 50
    ) -> bool:
        """
        Build index from embeddings (full rebuild).

        v6.0: Supports faces without person_id and excluded flags.

        Args:
            person_ids: List of person IDs (can contain None for unassigned faces)
            embeddings: List of 512-dim embeddings
            verified_flags: List of verified status (True/False) for each embedding
            confidences: List of recognition_confidence for each embedding
            face_ids: List of face IDs for incremental operations (optional)
            excluded_flags: List of excluded_from_index status (v6.0)
            ef_construction: HNSW construction parameter
            M: HNSW M parameter (number of connections)
            ef_search: HNSW search parameter

        Returns:
            True if successful
        """
        if len(embeddings) == 0:
            logger.warning("No embeddings provided for index")
            return False

        # Default values for optional parameters
        if verified_flags is None:
            verified_flags = [False] * len(embeddings)
        if confidences is None:
            confidences = [0.0] * len(embeddings)
        if face_ids is None:
            face_ids = [f"unknown_{i}" for i in range(len(embeddings))]
        if excluded_flags is None:
            excluded_flags = [False] * len(embeddings)

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

            # Store mappings (person_ids can contain None)
            self.ids_map = list(person_ids)
            self.verified_map = list(verified_flags)
            self.confidence_map = list(confidences)
            self.excluded_map = list(excluded_flags)
            self.face_id_map = list(face_ids)

            # Build reverse lookup
            self.face_id_to_label = {fid: i for i, fid in enumerate(face_ids)}
            self.next_label = num_elements
            self.deleted_count = 0
            self.last_rebuild_time = datetime.now()

            # Count statistics
            with_person = sum(1 for p in person_ids if p is not None)
            verified_count = sum(1 for v in verified_flags if v)
            excluded_count = sum(1 for e in excluded_flags if e)
            unique_people = len(set(p for p in person_ids if p is not None))

            logger.info(f"HNSW index built: {num_elements} faces ({with_person} with person_id, "
                       f"{verified_count} verified, {excluded_count} excluded) "
                       f"for {unique_people} unique people, capacity={self.max_elements}")

            return True

        except Exception as e:
            logger.error(f"Error building HNSW index: {e}")
            return False

    # ==================== Incremental Operations ====================

    def add_item(
        self,
        face_id: str,
        person_id: Optional[str],
        embedding: np.ndarray,
        verified: bool = False,
        confidence: float = 0.0,
        excluded: bool = False
    ) -> bool:
        """
        Add a single face to the index.

        v6.0: person_id can be None for unassigned faces.

        Args:
            face_id: Unique face identifier
            person_id: Person this face belongs to (can be None)
            embedding: 512-dim face embedding
            verified: Whether this face is verified
            confidence: Recognition confidence (0.0 if no person_id)
            excluded: Whether face is excluded from recognition

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
                self.ids_map.append(None)
                self.verified_map.append(False)
                self.confidence_map.append(0.0)
                self.excluded_map.append(False)
                self.face_id_map.append("")

            # Store mappings
            self.ids_map[label] = person_id
            self.verified_map[label] = verified
            self.confidence_map[label] = confidence
            self.excluded_map[label] = excluded
            self.face_id_map[label] = face_id
            self.face_id_to_label[face_id] = label

            # Add to HNSW
            self.index.add_items(embedding.reshape(1, -1), np.array([label]))

            logger.debug(f"Added face {face_id[:8]}... as label {label}, person_id={person_id[:8] if person_id else 'None'}")
            return True

        except Exception as e:
            logger.error(f"Error adding item: {e}")
            return False

    def add_items(
        self,
        face_ids: List[str],
        person_ids: List[Optional[str]],
        embeddings: List[np.ndarray],
        verified_flags: List[bool] = None,
        confidences: List[float] = None,
        excluded_flags: List[bool] = None
    ) -> int:
        """
        Add multiple faces to the index.

        v6.0: person_ids can contain None.

        Returns:
            Number of items successfully added
        """
        if not self.is_loaded():
            logger.warning("Index not loaded, cannot add items")
            return 0

        if verified_flags is None:
            verified_flags = [False] * len(face_ids)
        if confidences is None:
            confidences = [0.0] * len(face_ids)
        if excluded_flags is None:
            excluded_flags = [False] * len(face_ids)

        added = 0
        for i, face_id in enumerate(face_ids):
            if self.add_item(face_id, person_ids[i], embeddings[i],
                           verified_flags[i], confidences[i], excluded_flags[i]):
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

    def update_metadata(
        self,
        face_id: str,
        person_id: Optional[str] = None,
        verified: Optional[bool] = None,
        confidence: Optional[float] = None,
        excluded: Optional[bool] = None
    ) -> bool:
        """
        Update metadata for a face WITHOUT rebuilding the index.

        v6.0: Key method for all-faces-indexed architecture.
        Allows changing person_id, verified, confidence, excluded without touching HNSW.

        Args:
            face_id: Face to update
            person_id: New person_id (use empty string "" to explicitly set None)
            verified: New verified status
            confidence: New confidence value
            excluded: New excluded status

        Returns:
            True if face found and updated
        """
        label = self.face_id_to_label.get(face_id)
        if label is None:
            logger.debug(f"Face {face_id} not in index, cannot update metadata")
            return False

        try:
            # Update only provided values
            if person_id is not None:
                # Special case: empty string means set to None
                self.ids_map[label] = None if person_id == "" else person_id
            if verified is not None:
                self.verified_map[label] = verified
            if confidence is not None:
                self.confidence_map[label] = confidence
            if excluded is not None:
                self.excluded_map[label] = excluded

            logger.debug(f"Updated metadata for face {face_id[:8]}...: "
                        f"person_id={self.ids_map[label]}, verified={self.verified_map[label]}, "
                        f"confidence={self.confidence_map[label]:.2f}, excluded={self.excluded_map[label]}")
            return True

        except Exception as e:
            logger.error(f"Error updating metadata for {face_id}: {e}")
            return False

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
    ) -> Tuple[List[Optional[str]], List[float], List[bool], List[float], List[bool]]:
        """
        Query index for nearest neighbors.

        v6.0: Returns excluded flags. person_ids can contain None.

        Args:
            embedding: Query embedding (512-dim)
            k: Number of neighbors to return

        Returns:
            Tuple of (person_ids, similarities, verified_flags, source_confidences, excluded_flags)
            - person_ids can contain None for unassigned faces
            - Similarities are converted from cosine distance (1 - distance)
        """
        if not self.is_loaded():
            logger.warning("Index not loaded, cannot query")
            return [], [], [], [], []

        try:
            # Ensure k doesn't exceed index size
            k = min(k, self.get_count())

            # v6.1: Handle empty index gracefully
            if k == 0:
                return [], [], [], [], []

            labels, distances = self.index.knn_query(
                embedding.reshape(1, -1),
                k=k
            )

            # Convert to person IDs, similarities, and metadata
            person_ids = [self.ids_map[int(idx)] for idx in labels[0]]
            similarities = [1.0 - float(d) for d in distances[0]]
            verified_flags = [self.verified_map[int(idx)] for idx in labels[0]]
            source_confidences = [self.confidence_map[int(idx)] for idx in labels[0]]
            excluded_flags = [self.excluded_map[int(idx)] for idx in labels[0]]

            return person_ids, similarities, verified_flags, source_confidences, excluded_flags

        except Exception as e:
            logger.error(f"Error querying HNSW index: {e}")
            return [], [], [], [], []
    
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
