"""
Face grouping/clustering using HDBSCAN.
Groups similar faces together for player identification.
"""

import numpy as np
import hdbscan
from typing import List, Dict, Tuple
import logging

logger = logging.getLogger(__name__)


def cluster_faces(
    embeddings: np.ndarray,
    min_cluster_size: int = 3,
    min_samples: int = 2,
    cluster_selection_epsilon: float = 0.5
) -> np.ndarray:
    """
    Cluster face embeddings using HDBSCAN.
    
    Args:
        embeddings: Array of face embeddings (N x 512)
        min_cluster_size: Minimum cluster size for HDBSCAN
        min_samples: Minimum samples parameter for HDBSCAN
        cluster_selection_epsilon: Epsilon for cluster selection
        
    Returns:
        Array of cluster labels (-1 for noise/ungrouped)
    """
    if len(embeddings) < min_cluster_size:
        logger.warning(f"Not enough faces for clustering: {len(embeddings)} < {min_cluster_size}")
        return np.array([-1] * len(embeddings))
    
    logger.info(f"Starting HDBSCAN clustering on {len(embeddings)} embeddings...")
    
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric='euclidean',
        cluster_selection_epsilon=cluster_selection_epsilon
    )
    
    cluster_labels = clusterer.fit_predict(embeddings)
    
    unique_labels = set(cluster_labels)
    num_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
    noise_count = sum(1 for l in cluster_labels if l == -1)
    
    logger.info(f"HDBSCAN completed: {num_clusters} clusters, {noise_count} noise points")
    
    return cluster_labels


def group_faces_by_clusters(
    faces_data: List[Dict],
    cluster_labels: np.ndarray
) -> Tuple[List[Dict], List[Dict]]:
    """
    Group face data by cluster labels.
    
    Args:
        faces_data: List of face data dictionaries
        cluster_labels: Array of cluster labels from HDBSCAN
        
    Returns:
        Tuple of (groups, ungrouped_faces)
        - groups: List of group dicts with group_id, faces, stats
        - ungrouped_faces: List of faces that weren't clustered
    """
    groups_dict: Dict[int, List[Dict]] = {}
    ungrouped_faces: List[Dict] = []
    
    for face_data, label in zip(faces_data, cluster_labels):
        if label == -1:  # Noise
            ungrouped_faces.append(face_data)
        else:
            if label not in groups_dict:
                groups_dict[label] = []
            groups_dict[label].append(face_data)
    
    # Build result groups
    groups = []
    for cluster_id, faces in groups_dict.items():
        # Get unique image names for preview (max 5)
        unique_images = list(set([f.get("image_name", "") for f in faces]))[:5]
        
        # Calculate average confidence
        confidences = [f.get("confidence", 0) for f in faces]
        avg_confidence = float(np.mean(confidences)) if confidences else 0.0
        
        group = {
            "group_id": f"player_{cluster_id}",
            "player_name": f"Player {cluster_id + 1}",
            "faces_count": len(faces),
            "faces": faces,
            "confidence": avg_confidence,
            "sample_images": unique_images
        }
        groups.append(group)
    
    logger.info(f"Grouped into {len(groups)} groups, {len(ungrouped_faces)} ungrouped")
    
    return groups, ungrouped_faces


async def group_tournament_faces(
    embeddings: List[np.ndarray],
    faces_data: List[Dict],
    min_cluster_size: int = 3
) -> Tuple[List[Dict], List[Dict]]:
    """
    High-level function to group faces from a tournament/session.
    
    Args:
        embeddings: List of face embeddings
        faces_data: List of face data dicts
        min_cluster_size: Minimum cluster size
        
    Returns:
        Tuple of (groups, ungrouped_faces)
    """
    if len(embeddings) < min_cluster_size:
        raise ValueError(f"Not enough faces for clustering (minimum {min_cluster_size})")
    
    embeddings_array = np.array(embeddings)
    cluster_labels = cluster_faces(embeddings_array, min_cluster_size=min_cluster_size)
    
    return group_faces_by_clusters(faces_data, cluster_labels)
