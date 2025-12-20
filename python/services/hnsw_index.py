"""
HNSW index management for face recognition.
Handles loading, building, and querying the players index.

v2.0: Added add_embeddings for incremental updates
"""

import numpy as np
import hnswlib
from typing import List, Tuple, Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


class HNSWIndex:
    """
    Wrapper for HNSWLIB index operations.
    Manages the players index for face recognition.
    
    Stores verified status and confidence for each embedding to support
    confidence chain multiplication for non-verified matches.
    """
    
    def __init__(self):
        self.index: Optional[hnswlib.Index] = None
        self.ids_map: List[str] = []  # Maps index positions to person IDs
        self.verified_map: List[bool] = []  # Maps index positions to verified status
        self.confidence_map: List[float] = []  # Maps index positions to recognition_confidence
        self.dim: int = 512  # InsightFace embedding dimension
    
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
        ef_construction: int = 200,
        M: int = 16,
        ef_search: int = 50
    ) -> bool:
        """
        Build index from embeddings.
        
        Args:
            person_ids: List of person IDs corresponding to embeddings
            embeddings: List of 512-dim embeddings
            verified_flags: List of verified status (True/False) for each embedding
            confidences: List of recognition_confidence for each embedding
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
        
        try:
            dim = len(embeddings[0])
            self.dim = dim
            
            # Create index
            self.index = hnswlib.Index(space='cosine', dim=dim)
            self.index.init_index(
                max_elements=len(embeddings) * 2,
                ef_construction=ef_construction,
                M=M
            )
            
            # Add embeddings
            embeddings_array = np.array(embeddings)
            self.index.add_items(embeddings_array, np.arange(len(embeddings)))
            self.index.set_ef(ef_search)
            
            # Store mappings
            self.ids_map = list(person_ids)
            self.verified_map = list(verified_flags)
            self.confidence_map = list(confidences)
            
            unique_people = len(set(person_ids))
            verified_count = sum(1 for v in verified_flags if v)
            logger.info(f"HNSW index built: {len(embeddings)} embeddings ({verified_count} verified) for {unique_people} unique people")
            
            return True
            
        except Exception as e:
            logger.error(f"Error building HNSW index: {e}")
            return False
    
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
    
    def add_embeddings(
        self,
        person_ids: List[str],
        embeddings: List[np.ndarray],
        verified_flags: List[bool],
        confidences: List[float]
    ) -> bool:
        """
        Append new embeddings to an already built index.
        
        Args:
            person_ids: Person IDs for each embedding
            embeddings: Embeddings to add
            verified_flags: Verified flags matching each embedding
            confidences: recognition_confidence for each embedding
            
        Returns:
            True on success, False otherwise.
        """
        if not self.is_loaded():
            logger.warning("Cannot add embeddings: index not loaded")
            return False
        
        if not embeddings:
            logger.warning("Cannot add embeddings: empty payload")
            return False
        
        try:
            current_count = self.get_count()
            new_count = current_count + len(embeddings)
            
            # Ensure index has enough capacity for new elements
            self.index.resize_index(new_count)
            
            labels = np.arange(current_count, new_count)
            embeddings_array = np.array(embeddings, dtype=np.float32)
            self.index.add_items(embeddings_array, labels)
            
            self.ids_map.extend(person_ids)
            self.verified_map.extend(verified_flags)
            self.confidence_map.extend(confidences)
            
            logger.info(
                f"HNSW index incrementally updated: +{len(embeddings)} embeddings (total={new_count})"
            )
            return True
            
        except Exception as e:
            logger.error(f"Error adding embeddings to HNSW index: {e}")
            return False
    
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
