"""
Pydantic models for face recognition endpoints.
Extracted from routers/recognition.py for better maintainability.
"""

from pydantic import BaseModel
from typing import List, Optional, Dict


class DetectFacesRequest(BaseModel):
    """Request for /detect-faces endpoint"""
    image_url: str
    apply_quality_filters: bool = True
    min_detection_score: float = 0.7
    min_face_size: float = 60.0
    min_blur_score: float = 80.0


class RecognizeFaceRequest(BaseModel):
    """Request for /recognize-face endpoint"""
    embedding: List[float]
    confidence_threshold: Optional[float] = None


class BatchRecognizeRequest(BaseModel):
    """Request for /batch-recognize endpoint"""
    gallery_ids: List[str]
    confidence_threshold: Optional[float] = None
    apply_quality_filters: bool = True


class GenerateDescriptorsRequest(BaseModel):
    """Request for /generate-descriptors endpoint"""
    image_url: str
    faces: List[dict]  # [{person_id, bbox, verified}]


class ProcessPhotoRequest(BaseModel):
    """Request for /process-photo endpoint"""
    photo_id: str
    force_redetect: bool = False
    apply_quality_filters: bool = True
    confidence_threshold: Optional[float] = None
    min_detection_score: Optional[float] = None
    min_face_size: Optional[float] = None
    min_blur_score: Optional[float] = None


class ProcessPhotoResponse(BaseModel):
    """Response for /process-photo endpoint"""
    success: bool
    data: Optional[List[dict]]
    error: Optional[str]


class FaceDetectionResponse(BaseModel):
    """Response for /detect-faces endpoint"""
    faces: List[dict]  # [{insightface_bbox, confidence, blur_score, distance_to_nearest, top_matches}]


class FaceRecognitionResponse(BaseModel):
    """Response for /recognize-face endpoint"""
    person_id: Optional[str]
    confidence: Optional[float]
