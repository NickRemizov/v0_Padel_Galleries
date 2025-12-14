"""
Dataset preparation for face recognition training.
Handles loading verified faces and downloading photos.
"""

import os
import hashlib
from typing import List, Dict, Optional
import numpy as np
import cv2
import httpx
import logging

logger = logging.getLogger(__name__)


async def prepare_dataset(
    supabase_client,
    filters: Dict,
    options: Dict
) -> Dict:
    """
    Prepare dataset for training (without starting training).
    
    Args:
        supabase_client: SupabaseClient instance
        filters: Dict with event_ids, person_ids, date_from, date_to
        options: Dict with min_faces_per_person, include_co_occurring
    
    Returns:
        Dataset statistics and validation results
    """
    logger.info("Preparing dataset...")
    
    # Get verified faces from Supabase
    faces = await supabase_client.get_verified_faces(
        event_ids=filters.get('event_ids'),
        person_ids=filters.get('person_ids'),
        date_from=filters.get('date_from'),
        date_to=filters.get('date_to'),
        min_faces_per_person=options['min_faces_per_person']
    )
    
    # If include_co_occurring, add related people
    if options.get('include_co_occurring'):
        event_ids = list(set(f['gallery_id'] for f in faces if f['gallery_id']))
        if event_ids:
            co_occurring = await supabase_client.get_co_occurring_people(event_ids)
            # Add faces of co-occurring people
            # (Implementation depends on requirements)
    
    # Group by person_id and calculate statistics
    people_faces = {}
    for face in faces:
        person_id = face['person_id']
        if person_id not in people_faces:
            people_faces[person_id] = []
        people_faces[person_id].append(face)
    
    # Calculate statistics
    from services.training.metrics import calculate_distribution
    
    face_counts = [len(faces) for faces in people_faces.values()]
    stats = {
        'total_people': len(people_faces),
        'total_faces': len(faces),
        'faces_per_person': {
            'min': min(face_counts) if face_counts else 0,
            'max': max(face_counts) if face_counts else 0,
            'avg': sum(face_counts) / len(face_counts) if face_counts else 0
        },
        'people_by_face_count': calculate_distribution(face_counts)
    }
    
    # Validation
    warnings = []
    errors = []
    
    if stats['total_people'] < 2:
        errors.append('Need at least 2 people for training')
    
    for person_id, person_faces in people_faces.items():
        if len(person_faces) < 5:
            person_name = person_faces[0]['person_name']
            warnings.append(f'{person_name} has only {len(person_faces)} faces')
    
    logger.info(f"Dataset prepared: {stats['total_people']} people, {stats['total_faces']} faces")
    
    return {
        'dataset_stats': stats,
        'validation': {
            'ready': len(errors) == 0,
            'warnings': warnings,
            'errors': errors
        }
    }


async def download_photo(
    photo_url: str,
    cache_dir: str = 'data/cache/photos',
    supabase_client=None
) -> np.ndarray:
    """
    Download photo with caching.
    
    Args:
        photo_url: URL to download
        cache_dir: Directory for caching photos
        supabase_client: Optional client for cache lookup
    
    Returns:
        Image as numpy array (BGR format)
    """
    # Check cache first
    if supabase_client:
        cached_path = supabase_client.get_cached_photo(photo_url)
        if cached_path and os.path.exists(cached_path):
            return cv2.imread(cached_path)
    
    # Download from URL
    async with httpx.AsyncClient() as client:
        response = await client.get(photo_url)
        response.raise_for_status()
        
        # Save to cache
        os.makedirs(cache_dir, exist_ok=True)
        
        filename = hashlib.md5(photo_url.encode()).hexdigest() + '.jpg'
        local_path = os.path.join(cache_dir, filename)
        
        with open(local_path, 'wb') as f:
            f.write(response.content)
        
        # Update cache in supabase if available
        if supabase_client and hasattr(supabase_client, 'save_photo_cache'):
            supabase_client.save_photo_cache(photo_url, local_path)
        
        return cv2.imread(local_path)


def calculate_iou(bbox1: Dict, bbox2) -> float:
    """
    Calculate Intersection over Union between two bounding boxes.
    
    Args:
        bbox1: Dict with x, y, width, height
        bbox2: Array [x1, y1, x2, y2] from InsightFace
    
    Returns:
        IoU value (0-1)
    """
    # Convert bbox1 to x1, y1, x2, y2
    x1_1 = bbox1['x']
    y1_1 = bbox1['y']
    x2_1 = bbox1['x'] + bbox1['width']
    y2_1 = bbox1['y'] + bbox1['height']
    
    # bbox2 is already [x1, y1, x2, y2]
    x1_2, y1_2, x2_2, y2_2 = bbox2
    
    # Calculate intersection
    x1 = max(x1_1, x1_2)
    y1 = max(y1_1, y1_2)
    x2 = min(x2_1, x2_2)
    y2 = min(y2_1, y2_2)
    
    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    
    # Calculate union
    area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
    area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
    union = area1 + area2 - intersection
    
    return intersection / union if union > 0 else 0


def match_face_to_detected(
    saved_bbox: Dict,
    detected_faces: List,
    min_iou: float = 0.3
) -> tuple:
    """
    Match a saved face bbox to detected faces by IoU.
    
    Args:
        saved_bbox: Dict with x, y, width, height
        detected_faces: List of InsightFace detection results
        min_iou: Minimum IoU threshold
    
    Returns:
        Tuple of (best_match, best_iou) or (None, 0)
    """
    best_match = None
    best_iou = 0
    
    for detected in detected_faces:
        iou = calculate_iou(saved_bbox, detected.bbox)
        
        if iou > best_iou:
            best_iou = iou
            best_match = detected
    
    if best_iou >= min_iou:
        return best_match, best_iou
    
    return None, best_iou
