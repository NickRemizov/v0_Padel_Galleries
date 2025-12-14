"""
Training response models.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from models.domain.training import (
    TrainingSession,
    TrainingMetrics,
    TrainingStatus,
    TrainingProgress,
)


class FaceCountDistribution(BaseModel):
    """Distribution of people by face count."""
    
    range_3_4: int = Field(0, alias="3-4")
    range_5_9: int = Field(0, alias="5-9")
    range_10_14: int = Field(0, alias="10-14")
    range_15_19: int = Field(0, alias="15-19")
    range_20_plus: int = Field(0, alias="20+")
    
    class Config:
        populate_by_name = True


class DatasetStats(BaseModel):
    """Training dataset statistics."""
    
    total_people: int = Field(..., description="People in dataset")
    total_faces: int = Field(..., description="Total faces")
    
    faces_per_person: Dict[str, float] = Field(
        ...,
        description="Min/max/avg faces per person"
    )
    
    people_by_face_count: FaceCountDistribution = Field(
        ...,
        description="Distribution by face count"
    )


class DatasetValidation(BaseModel):
    """Dataset validation results."""
    
    ready: bool = Field(..., description="Dataset is ready for training")
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class DatasetStatsResponse(BaseModel):
    """Response from dataset preparation."""
    
    dataset_stats: DatasetStats
    validation: DatasetValidation


class TrainingStatusResponse(BaseModel):
    """Response for training status query."""
    
    session_id: str
    status: TrainingStatus
    started_at: Optional[datetime] = None
    
    # Progress (if running)
    progress: Optional[TrainingProgress] = None
    current_step: Optional[str] = None
    estimated_completion: Optional[datetime] = None
    
    # Results (if completed)
    metrics: Optional[TrainingMetrics] = None
    faces_count: Optional[int] = None
    people_count: Optional[int] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class TrainingHistoryItem(BaseModel):
    """Single training history entry."""
    
    id: str
    status: TrainingStatus
    training_mode: str
    faces_count: int
    people_count: int
    metrics: Optional[TrainingMetrics] = None
    created_at: Optional[datetime] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class TrainingHistoryResponse(BaseModel):
    """Response for training history query."""
    
    sessions: List[TrainingHistoryItem]
    total: int
    page: int = 1
    per_page: int = 10
