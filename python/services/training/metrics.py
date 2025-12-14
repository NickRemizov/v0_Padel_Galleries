"""
Metrics calculation for face recognition training.
Handles accuracy, precision, recall and distribution statistics.
"""

from typing import List, Dict
import numpy as np
import hnswlib
from sklearn.model_selection import train_test_split
import logging

logger = logging.getLogger(__name__)


async def calculate_metrics(
    descriptors: List[np.ndarray],
    person_ids: List[str],
    test_size: float = 0.2,
    random_state: int = 42
) -> Dict:
    """
    Calculate model quality metrics using train/test split.
    
    Args:
        descriptors: List of 512-dim face embeddings
        person_ids: List of person IDs corresponding to embeddings
        test_size: Fraction of data to use for testing
        random_state: Random seed for reproducibility
    
    Returns:
        Dict with accuracy, precision, recall, test_samples, correct_predictions
    """
    if len(descriptors) < 10:
        logger.warning("Too few samples for metrics calculation")
        return {
            'accuracy': 0,
            'precision': 0,
            'recall': 0,
            'note': 'Too few samples'
        }
    
    # Split data
    indices = list(range(len(descriptors)))
    train_idx, test_idx = train_test_split(
        indices,
        test_size=test_size,
        random_state=random_state,
        stratify=person_ids
    )
    
    train_descriptors = [descriptors[i] for i in train_idx]
    train_person_ids = [person_ids[i] for i in train_idx]
    
    # Build temporary index
    temp_index = hnswlib.Index(space='cosine', dim=512)
    temp_index.init_index(
        max_elements=len(train_descriptors),
        ef_construction=200,
        M=16
    )
    temp_index.add_items(
        np.array(train_descriptors),
        list(range(len(train_descriptors)))
    )
    
    # Evaluate on test set
    correct = 0
    total = len(test_idx)
    
    for i in test_idx:
        test_descriptor = descriptors[i]
        true_person_id = person_ids[i]
        
        labels, distances = temp_index.knn_query(
            test_descriptor.reshape(1, -1),
            k=1
        )
        predicted_person_id = train_person_ids[labels[0][0]]
        
        if predicted_person_id == true_person_id:
            correct += 1
    
    accuracy = correct / total if total > 0 else 0
    
    logger.info(f"Metrics calculated: accuracy={accuracy:.3f}, {correct}/{total} correct")
    
    return {
        'accuracy': round(accuracy, 3),
        'precision': round(accuracy, 3),  # Simplified: same as accuracy for 1-NN
        'recall': round(accuracy, 3),
        'test_samples': total,
        'correct_predictions': correct
    }


def calculate_distribution(face_counts: List[int]) -> Dict[str, int]:
    """
    Calculate distribution of people by face count.
    
    Args:
        face_counts: List of face counts per person
    
    Returns:
        Dict with ranges as keys and counts as values
    """
    distribution = {
        '3-4': 0,
        '5-9': 0,
        '10-14': 0,
        '15-19': 0,
        '20+': 0
    }
    
    for count in face_counts:
        if 3 <= count <= 4:
            distribution['3-4'] += 1
        elif 5 <= count <= 9:
            distribution['5-9'] += 1
        elif 10 <= count <= 14:
            distribution['10-14'] += 1
        elif 15 <= count <= 19:
            distribution['15-19'] += 1
        else:
            distribution['20+'] += 1
    
    return distribution


def calculate_similarity_stats(
    descriptors: List[np.ndarray],
    person_ids: List[str]
) -> Dict:
    """
    Calculate intra-class and inter-class similarity statistics.
    Useful for understanding model quality.
    
    Args:
        descriptors: List of face embeddings
        person_ids: List of person IDs
    
    Returns:
        Dict with intra_class_avg, inter_class_avg, separation_margin
    """
    if len(descriptors) < 2:
        return {
            'intra_class_avg': 0,
            'inter_class_avg': 0,
            'separation_margin': 0
        }
    
    # Normalize descriptors
    normalized = [d / np.linalg.norm(d) for d in descriptors]
    
    # Group by person
    person_descriptors = {}
    for desc, pid in zip(normalized, person_ids):
        if pid not in person_descriptors:
            person_descriptors[pid] = []
        person_descriptors[pid].append(desc)
    
    # Calculate intra-class similarities (same person)
    intra_similarities = []
    for pid, descs in person_descriptors.items():
        if len(descs) < 2:
            continue
        for i in range(len(descs)):
            for j in range(i + 1, len(descs)):
                sim = float(np.dot(descs[i], descs[j]))
                intra_similarities.append(sim)
    
    # Calculate inter-class similarities (different persons)
    # Sample to avoid O(n^2) complexity
    inter_similarities = []
    person_list = list(person_descriptors.keys())
    
    for i in range(min(100, len(person_list))):
        for j in range(i + 1, min(100, len(person_list))):
            pid1, pid2 = person_list[i], person_list[j]
            # Compare first descriptor of each person
            desc1 = person_descriptors[pid1][0]
            desc2 = person_descriptors[pid2][0]
            sim = float(np.dot(desc1, desc2))
            inter_similarities.append(sim)
    
    intra_avg = np.mean(intra_similarities) if intra_similarities else 0
    inter_avg = np.mean(inter_similarities) if inter_similarities else 0
    
    return {
        'intra_class_avg': round(float(intra_avg), 3),
        'inter_class_avg': round(float(inter_avg), 3),
        'separation_margin': round(float(intra_avg - inter_avg), 3)
    }
