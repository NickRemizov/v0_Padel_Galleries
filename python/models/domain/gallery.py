"""
Gallery and GalleryImage domain models.
Represents photo galleries (events/tournaments).
"""

from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field
from enum import Enum


class GalleryStatus(str, Enum):
    """Gallery processing status."""
    DRAFT = "draft"
    PROCESSING = "processing"
    READY = "ready"
    PUBLISHED = "published"


class GalleryImage(BaseModel):
    """Photo in a gallery."""
    
    id: str = Field(..., description="Unique image ID")
    gallery_id: str = Field(..., description="Parent gallery ID")
    
    # Image data
    image_url: str = Field(..., description="Full image URL")
    thumbnail_url: Optional[str] = Field(None, description="Thumbnail URL")
    original_filename: Optional[str] = Field(None, description="Original filename")
    
    # Dimensions
    width: Optional[int] = Field(None, ge=0, description="Image width")
    height: Optional[int] = Field(None, ge=0, description="Image height")
    
    # Processing status
    has_been_processed: bool = Field(False, description="Face detection completed")
    faces_count: int = Field(0, ge=0, description="Number of detected faces")
    
    # Timestamps
    created_at: Optional[datetime] = Field(None, description="Upload timestamp")
    
    @property
    def aspect_ratio(self) -> Optional[float]:
        """Image aspect ratio (width/height)."""
        if self.width and self.height and self.height > 0:
            return self.width / self.height
        return None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class Gallery(BaseModel):
    """Photo gallery (event/tournament)."""
    
    id: str = Field(..., description="Unique gallery ID")
    title: str = Field(..., description="Gallery title")
    
    # Event info
    description: Optional[str] = Field(None, description="Gallery description")
    shoot_date: Optional[date] = Field(None, description="Event/shoot date")
    location_id: Optional[str] = Field(None, description="Location reference")
    organizer_id: Optional[str] = Field(None, description="Organizer reference")
    photographer_id: Optional[str] = Field(None, description="Photographer reference")
    
    # Status
    status: GalleryStatus = Field(GalleryStatus.DRAFT, description="Gallery status")
    is_public: bool = Field(False, description="Publicly visible")
    
    # Statistics (denormalized)
    photos_count: int = Field(0, ge=0, description="Total photos")
    processed_count: int = Field(0, ge=0, description="Processed photos")
    faces_count: int = Field(0, ge=0, description="Total detected faces")
    people_count: int = Field(0, ge=0, description="Unique people")
    
    # Timestamps
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    
    @property
    def processing_progress(self) -> float:
        """Processing progress (0-1)."""
        if self.photos_count == 0:
            return 0
        return self.processed_count / self.photos_count
    
    @property
    def is_fully_processed(self) -> bool:
        """All photos have been processed."""
        return self.processed_count >= self.photos_count
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None,
            date: lambda v: v.isoformat() if v else None
        }
