"""
Common request models used across endpoints.
"""

from typing import Optional
from pydantic import BaseModel, Field


class PaginationParams(BaseModel):
    """Pagination parameters."""
    
    page: int = Field(1, ge=1, description="Page number")
    per_page: int = Field(20, ge=1, le=100, description="Items per page")
    
    @property
    def offset(self) -> int:
        """Calculate offset for database query."""
        return (self.page - 1) * self.per_page


class IdRequest(BaseModel):
    """Request with single ID."""
    
    id: str = Field(..., description="Entity ID")


class IdsRequest(BaseModel):
    """Request with multiple IDs."""
    
    ids: list[str] = Field(..., min_length=1, description="List of entity IDs")
