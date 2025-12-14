"""
Training domain models.
Represents training sessions and configuration.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


class TrainingMode(str, Enum):
    """Training mode."""
    FULL = "full"           # Rebuild index from scratch
    INCREMENTAL = "incremental"  # Add new embeddings to existing index


class TrainingStatus(str, Enum):
    """Training session status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TrainingMetrics(BaseModel):
    """Training quality metrics."""
    
    accuracy: float = Field(0, ge=0, le=1, description="Model accuracy")
    precision: float = Field(0, ge=0, le=1, description="Precision score")
    recall: float = Field(0, ge=0, le=1, description="Recall score")
    
    test_samples: int = Field(0, ge=0, description="Test set size")
    correct_predictions: int = Field(0, ge=0, description="Correct predictions")
    
    # Optional extended metrics
    intra_class_similarity: Optional[float] = Field(None, description="Avg similarity within same person")
    inter_class_similarity: Optional[float] = Field(None, description="Avg similarity between different people")
    separation_margin: Optional[float] = Field(None, description="Intra - Inter similarity")
    
    error: Optional[str] = Field(None, description="Error message if failed")


class TrainingProgress(BaseModel):
    """Training progress information."""
    
    current: int = Field(0, ge=0, description="Current step")
    total: int = Field(0, ge=0, description="Total steps")
    step: str = Field("", description="Current step description")
    
    @property
    def percentage(self) -> int:
        """Progress percentage (0-100)."""
        if self.total == 0:
            return 0
        return int((self.current / self.total) * 100)


class TrainingSession(BaseModel):
    """Training session record."""
    
    id: str = Field(..., description="Session ID")
    
    # Configuration
    model_version: str = Field("v1.0", description="Model version")
    training_mode: TrainingMode = Field(TrainingMode.FULL, description="Training mode")
    
    # Parameters
    context_weight: float = Field(0.1, ge=0, le=1, description="Context weight")
    min_faces_per_person: int = Field(3, ge=1, description="Min faces per person")
    
    # Results
    faces_count: int = Field(0, ge=0, description="Faces used in training")
    people_count: int = Field(0, ge=0, description="People in training set")
    metrics: Optional[TrainingMetrics] = Field(None, description="Quality metrics")
    
    # Status
    status: TrainingStatus = Field(TrainingStatus.PENDING, description="Session status")
    progress: Optional[TrainingProgress] = Field(None, description="Current progress")
    
    # Timestamps
    created_at: Optional[datetime] = Field(None, description="Start timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Training duration in seconds."""
        if self.created_at and self.completed_at:
            return (self.completed_at - self.created_at).total_seconds()
        return None
    
    @property
    def is_running(self) -> bool:
        return self.status == TrainingStatus.RUNNING
    
    @property
    def is_completed(self) -> bool:
        return self.status == TrainingStatus.COMPLETED
    
    @property
    def is_failed(self) -> bool:
        return self.status == TrainingStatus.FAILED
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class TrainingConfig(BaseModel):
    """Training configuration from database."""
    
    # Confidence thresholds
    confidence_thresholds: Dict[str, float] = Field(
        default_factory=lambda: {
            "low_data": 0.75,
            "medium_data": 0.65,
            "high_data": 0.55
        },
        description="Confidence thresholds by data amount"
    )
    
    # Training parameters
    context_weight: float = Field(0.10, ge=0, le=1, description="Context weight")
    min_faces_per_person: int = Field(3, ge=1, description="Min faces per person")
    
    # Auto-retrain triggers
    auto_retrain_threshold: int = Field(25, ge=1, description="New faces to trigger retrain")
    auto_retrain_percentage: float = Field(0.10, ge=0, le=1, description="Percentage threshold")
    
    # Quality filters
    quality_filters: Dict[str, float] = Field(
        default_factory=lambda: {
            "min_detection_score": 0.70,
            "min_face_size": 80,
            "min_blur_score": 80
        },
        description="Quality filter thresholds"
    )
    
    def get_confidence_threshold(self, faces_per_person: int) -> float:
        """Get appropriate threshold based on data amount."""
        if faces_per_person < 5:
            return self.confidence_thresholds.get("low_data", 0.75)
        elif faces_per_person < 15:
            return self.confidence_thresholds.get("medium_data", 0.65)
        else:
            return self.confidence_thresholds.get("high_data", 0.55)
