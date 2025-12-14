"""
Face domain model.
Represents a detected face in a photo.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field
import numpy as np


class BoundingBox(BaseModel):
    """Face bounding box coordinates."""
    
    x: float = Field(..., description="Left edge X coordinate")
    y: float = Field(..., description="Top edge Y coordinate")
    width: float = Field(..., ge=0, description="Box width")
    height: float = Field(..., ge=0, description="Box height")
    
    @property
    def x2(self) -> float:
        """Right edge X coordinate."""
        return self.x + self.width
    
    @property
    def y2(self) -> float:
        """Bottom edge Y coordinate."""
        return self.y + self.height
    
    @property
    def area(self) -> float:
        """Bounding box area."""
        return self.width * self.height
    
    @property
    def center(self) -> tuple:
        """Center point (x, y)."""
        return (self.x + self.width / 2, self.y + self.height / 2)
    
    def iou(self, other: "BoundingBox") -> float:
        """Calculate Intersection over Union with another box."""
        # Intersection
        x1 = max(self.x, other.x)
        y1 = max(self.y, other.y)
        x2 = min(self.x2, other.x2)
        y2 = min(self.y2, other.y2)
        
        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        union = self.area + other.area - intersection
        
        return intersection / union if union > 0 else 0
    
    @classmethod
    def from_xyxy(cls, x1: float, y1: float, x2: float, y2: float) -> "BoundingBox":
        """Create from (x1, y1, x2, y2) format."""
        return cls(x=x1, y=y1, width=x2-x1, height=y2-y1)
    
    def to_xyxy(self) -> tuple:
        """Convert to (x1, y1, x2, y2) format."""
        return (self.x, self.y, self.x2, self.y2)
    
    class Config:
        frozen = True  # Immutable


class FaceQuality(BaseModel):
    """Face quality metrics."""
    
    detection_score: float = Field(..., ge=0, le=1, description="Detection confidence")
    blur_score: Optional[float] = Field(None, ge=0, description="Blur score (higher = sharper)")
    face_size: Optional[int] = Field(None, ge=0, description="Face size in pixels")
    pose_score: Optional[float] = Field(None, ge=0, le=1, description="Pose quality (1 = frontal)")
    
    def passes_threshold(
        self,
        min_detection_score: float = 0.7,
        min_blur_score: float = 80,
        min_face_size: int = 80
    ) -> bool:
        """Check if face passes quality thresholds."""
        if self.detection_score < min_detection_score:
            return False
        if self.blur_score is not None and self.blur_score < min_blur_score:
            return False
        if self.face_size is not None and self.face_size < min_face_size:
            return False
        return True


class Face(BaseModel):
    """Detected face in a photo."""
    
    id: str = Field(..., description="Unique face ID")
    photo_id: str = Field(..., description="Photo this face belongs to")
    person_id: Optional[str] = Field(None, description="Assigned person ID")
    
    # Bounding box
    bbox: BoundingBox = Field(..., description="Face location in image")
    
    # Quality metrics
    quality: Optional[FaceQuality] = Field(None, description="Quality metrics")
    
    # Recognition
    descriptor: Optional[List[float]] = Field(None, description="512-dim embedding vector")
    recognition_confidence: Optional[float] = Field(None, ge=0, le=1, description="Recognition confidence")
    
    # Verification status
    verified: bool = Field(False, description="Manually verified by admin")
    verified_at: Optional[datetime] = Field(None, description="Verification timestamp")
    verified_by: Optional[str] = Field(None, description="Admin who verified")
    
    # Metadata
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    training_used: bool = Field(False, description="Used in model training")
    
    @property
    def is_recognized(self) -> bool:
        """Face has been assigned to a person."""
        return self.person_id is not None
    
    @property
    def is_unknown(self) -> bool:
        """Face has not been assigned to anyone."""
        return self.person_id is None
    
    @property
    def has_descriptor(self) -> bool:
        """Face has embedding vector."""
        return self.descriptor is not None and len(self.descriptor) == 512
    
    def get_descriptor_array(self) -> Optional[np.ndarray]:
        """Get descriptor as numpy array."""
        if not self.has_descriptor:
            return None
        return np.array(self.descriptor, dtype=np.float32)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
