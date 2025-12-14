"""
Quality filters for face detection.
Calculates blur score and checks if faces pass quality thresholds.
"""

import cv2
import numpy as np
from typing import List, Tuple, Dict
import logging

logger = logging.getLogger(__name__)

# Default quality filter values
DEFAULT_QUALITY_FILTERS = {
    "min_detection_score": 0.7,
    "min_face_size": 80,
    "min_blur_score": 80
}


def calculate_blur_score(image: np.ndarray, bbox: List[float]) -> float:
    """
    Calculate blur score using Laplacian variance.
    Higher score = sharper image.
    
    Args:
        image: Full image array (BGR format)
        bbox: Face bounding box [x1, y1, x2, y2]
        
    Returns:
        Blur score (Laplacian variance). Typical range:
        - < 50: Very blurry
        - 50-100: Blurry
        - 100-200: Acceptable
        - > 200: Sharp
    """
    try:
        # Extract face region
        x1, y1, x2, y2 = [int(coord) for coord in bbox]
        
        # Add padding (10%) to include some context
        h, w = image.shape[:2]
        padding_x = int((x2 - x1) * 0.1)
        padding_y = int((y2 - y1) * 0.1)
        
        x1 = max(0, x1 - padding_x)
        y1 = max(0, y1 - padding_y)
        x2 = min(w, x2 + padding_x)
        y2 = min(h, y2 + padding_y)
        
        face_region = image[y1:y2, x1:x2]
        
        # Convert to grayscale
        gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
        
        # Calculate Laplacian variance
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        variance = laplacian.var()
        
        return float(variance)
        
    except Exception as e:
        logger.error(f"Error calculating blur score: {e}")
        return 0.0


def passes_quality_filters(
    det_score: float, 
    bbox: List[float], 
    blur_score: float,
    filters: Dict[str, float] = None
) -> Tuple[bool, str]:
    """
    Check if face passes quality filters.
    
    Args:
        det_score: Detection confidence (0-1)
        bbox: Bounding box [x1, y1, x2, y2]
        blur_score: Blur score from calculate_blur_score
        filters: Quality filter thresholds (uses defaults if None)
        
    Returns:
        Tuple of (passes: bool, reason: str)
    """
    if filters is None:
        filters = DEFAULT_QUALITY_FILTERS
    
    # Check detection score
    min_det = filters.get("min_detection_score", DEFAULT_QUALITY_FILTERS["min_detection_score"])
    if det_score < min_det:
        return False, f"det_score {det_score:.2f} < {min_det}"
    
    # Check face size
    face_width = bbox[2] - bbox[0]
    face_height = bbox[3] - bbox[1]
    face_size = min(face_width, face_height)
    
    min_size = filters.get("min_face_size", DEFAULT_QUALITY_FILTERS["min_face_size"])
    if face_size < min_size:
        return False, f"face_size {face_size:.0f}px < {min_size}px"
    
    # Check blur score
    min_blur = filters.get("min_blur_score", DEFAULT_QUALITY_FILTERS["min_blur_score"])
    if blur_score < min_blur:
        return False, f"blur_score {blur_score:.1f} < {min_blur}"
    
    return True, "passed"
