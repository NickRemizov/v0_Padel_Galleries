"""
Recognition request models.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from models.domain.face import BoundingBox


class DetectFacesRequest(BaseModel):
    """Request to detect faces in a photo."""
    
    photo_id: str = Field(..., description="Photo ID to process")
    photo_url: Optional[str] = Field(None, description="Photo URL (if not in DB)")
    
    # Quality filter options
    apply_quality_filters: bool = Field(True, description="Apply quality filters")
    min_detection_score: Optional[float] = Field(None, ge=0, le=1)
    min_face_size: Optional[int] = Field(None, ge=0)
    min_blur_score: Optional[float] = Field(None, ge=0)
    
    # Processing options
    save_to_db: bool = Field(True, description="Save detected faces to database")
    extract_descriptors: bool = Field(True, description="Extract face embeddings")


class RecognizeFaceRequest(BaseModel):
    """Request to recognize a single face."""
    
    face_id: Optional[str] = Field(None, description="Existing face ID")
    descriptor: Optional[List[float]] = Field(None, description="Face embedding (512-dim)")
    
    confidence_threshold: Optional[float] = Field(None, ge=0, le=1)
    
    # Context for better matching
    gallery_id: Optional[str] = Field(None, description="Gallery for context")
    photo_id: Optional[str] = Field(None, description="Photo for context")


class ProcessPhotoRequest(BaseModel):
    """Request to fully process a photo (detect + recognize)."""
    
    photo_id: str = Field(..., description="Photo ID")
    photo_url: Optional[str] = Field(None, description="Photo URL")
    gallery_id: Optional[str] = Field(None, description="Gallery ID")
    
    # Options
    apply_quality_filters: bool = Field(True)
    confidence_threshold: Optional[float] = Field(None, ge=0, le=1)
    save_results: bool = Field(True, description="Save results to database")


class GroupFacesRequest(BaseModel):
    """Request to group unknown faces by similarity."""
    
    gallery_id: str = Field(..., description="Gallery to process")
    
    # Clustering parameters
    min_cluster_size: int = Field(2, ge=2, description="Min faces per cluster")
    distance_threshold: float = Field(0.6, ge=0, le=1, description="Max distance for grouping")
    
    # Filters
    exclude_recognized: bool = Field(True, description="Exclude already recognized faces")
    min_face_quality: Optional[float] = Field(None, ge=0, le=1)


class AssignPersonRequest(BaseModel):
    """Request to assign a person to a face."""
    
    face_id: str = Field(..., description="Face ID")
    person_id: str = Field(..., description="Person ID to assign")
    
    # Verification
    verified: bool = Field(False, description="Mark as verified")
    confidence: Optional[float] = Field(None, ge=0, le=1, description="Override confidence")


class BatchAssignRequest(BaseModel):
    """Request to assign person to multiple faces."""
    
    face_ids: List[str] = Field(..., min_length=1, description="Face IDs")
    person_id: str = Field(..., description="Person ID to assign")
    verified: bool = Field(False)


class RejectFacesRequest(BaseModel):
    """Request to reject faces (mark as not interesting)."""
    
    face_ids: List[str] = Field(..., min_length=1, description="Face IDs to reject")
    reason: Optional[str] = Field(None, description="Rejection reason")
