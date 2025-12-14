"""
Recognition response models.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from models.domain.face import BoundingBox, FaceQuality
from models.domain.person import PersonSummary


class FaceDetectionResult(BaseModel):
    """Single detected face result."""
    
    face_id: str = Field(..., description="Generated or existing face ID")
    bbox: BoundingBox = Field(..., description="Face location")
    quality: FaceQuality = Field(..., description="Quality metrics")
    
    # Recognition (if performed)
    person_id: Optional[str] = Field(None, description="Matched person ID")
    person_name: Optional[str] = Field(None, description="Matched person name")
    confidence: Optional[float] = Field(None, ge=0, le=1, description="Recognition confidence")
    
    # Distances for debugging
    distance_to_nearest: Optional[float] = Field(None, description="Distance to nearest match")


class DetectFacesResponse(BaseModel):
    """Response from face detection."""
    
    photo_id: str
    faces: List[FaceDetectionResult]
    
    # Statistics
    total_detected: int = Field(..., description="Total faces detected")
    passed_filters: int = Field(..., description="Faces passing quality filters")
    filtered_out: int = Field(..., description="Faces filtered out")
    
    # Processing info
    processing_time_ms: Optional[float] = Field(None, description="Processing time")


class RecognitionResult(BaseModel):
    """Recognition result for a single face."""
    
    face_id: str
    recognized: bool = Field(..., description="Was a match found")
    
    # Match details (if recognized)
    person_id: Optional[str] = None
    person: Optional[PersonSummary] = None
    confidence: Optional[float] = Field(None, ge=0, le=1)
    
    # Alternative matches
    alternatives: Optional[List[Dict[str, Any]]] = Field(None, description="Other possible matches")


class ProcessPhotoResponse(BaseModel):
    """Response from full photo processing."""
    
    photo_id: str
    gallery_id: Optional[str] = None
    
    # Detection results
    faces: List[FaceDetectionResult]
    total_faces: int
    
    # Recognition summary
    recognized_count: int = Field(..., description="Faces matched to people")
    unknown_count: int = Field(..., description="Faces not matched")
    
    # People found
    people_found: List[PersonSummary] = Field(default_factory=list)
    
    processing_time_ms: Optional[float] = None


class FaceGroup(BaseModel):
    """Group of similar faces."""
    
    group_id: str = Field(..., description="Cluster/group ID")
    face_ids: List[str] = Field(..., description="Face IDs in group")
    face_count: int = Field(..., description="Number of faces")
    
    # Representative face
    representative_face_id: Optional[str] = Field(None, description="Best face in group")
    representative_photo_url: Optional[str] = Field(None, description="Photo URL")
    
    # Suggested match (if any)
    suggested_person_id: Optional[str] = None
    suggested_person_name: Optional[str] = None
    suggestion_confidence: Optional[float] = None


class GroupFacesResponse(BaseModel):
    """Response from face grouping."""
    
    gallery_id: str
    groups: List[FaceGroup]
    
    # Statistics
    total_faces_processed: int
    groups_count: int
    ungrouped_count: int = Field(..., description="Faces not in any group")
