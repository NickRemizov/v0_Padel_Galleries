"""
Person domain model.
Represents a person (player) in the system.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr


class PersonSummary(BaseModel):
    """Lightweight person reference."""
    
    id: str
    name: str = Field(..., description="Display name")
    avatar_url: Optional[str] = None
    
    class Config:
        frozen = True


class Person(BaseModel):
    """Full person model."""
    
    id: str = Field(..., description="Unique person ID")
    
    # Identity
    real_name: Optional[str] = Field(None, description="Real name")
    telegram_name: Optional[str] = Field(None, description="Telegram username")
    telegram_id: Optional[str] = Field(None, description="Telegram user ID")
    email: Optional[EmailStr] = Field(None, description="Email address")
    
    # Profile
    avatar_url: Optional[str] = Field(None, description="Avatar image URL")
    bio: Optional[str] = Field(None, description="Short biography")
    
    # Social links
    instagram: Optional[str] = Field(None, description="Instagram handle")
    
    # Statistics (denormalized for performance)
    photos_count: int = Field(0, ge=0, description="Total photos with this person")
    verified_faces_count: int = Field(0, ge=0, description="Verified face count")
    
    # Timestamps
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    
    @property
    def display_name(self) -> str:
        """Get best available display name."""
        return self.real_name or self.telegram_name or "Unknown"
    
    @property
    def has_avatar(self) -> bool:
        """Check if person has avatar."""
        return self.avatar_url is not None and len(self.avatar_url) > 0
    
    def to_summary(self) -> PersonSummary:
        """Convert to lightweight summary."""
        return PersonSummary(
            id=self.id,
            name=self.display_name,
            avatar_url=self.avatar_url
        )
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
