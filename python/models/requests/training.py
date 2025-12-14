"""
Training request models.
"""

from typing import Optional, List
from datetime import date
from pydantic import BaseModel, Field
from models.domain.training import TrainingMode


class TrainingFilters(BaseModel):
    """Filters for selecting training data."""
    
    event_ids: Optional[List[str]] = Field(None, description="Filter by gallery IDs")
    person_ids: Optional[List[str]] = Field(None, description="Filter by person IDs")
    date_from: Optional[date] = Field(None, description="Start date filter")
    date_to: Optional[date] = Field(None, description="End date filter")


class TrainingOptions(BaseModel):
    """Training options and parameters."""
    
    model_version: str = Field("v1.0", description="Model version")
    min_faces_per_person: int = Field(3, ge=1, description="Min faces per person")
    context_weight: float = Field(0.1, ge=0, le=1, description="Context weight")
    include_co_occurring: bool = Field(False, description="Include co-occurring people")


class PrepareDatasetRequest(BaseModel):
    """Request to prepare training dataset."""
    
    filters: TrainingFilters = Field(default_factory=TrainingFilters)
    options: TrainingOptions = Field(default_factory=TrainingOptions)


class ExecuteTrainingRequest(BaseModel):
    """Request to execute training."""
    
    mode: TrainingMode = Field(TrainingMode.FULL, description="Training mode")
    filters: TrainingFilters = Field(default_factory=TrainingFilters)
    options: TrainingOptions = Field(default_factory=TrainingOptions)


class UpdateConfigRequest(BaseModel):
    """Request to update training configuration."""
    
    confidence_thresholds: Optional[dict] = Field(None)
    context_weight: Optional[float] = Field(None, ge=0, le=1)
    min_faces_per_person: Optional[int] = Field(None, ge=1)
    auto_retrain_threshold: Optional[int] = Field(None, ge=1)
    auto_retrain_percentage: Optional[float] = Field(None, ge=0, le=1)
    quality_filters: Optional[dict] = Field(None)
