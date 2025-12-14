"""
Unified API response format.
All endpoints should return ApiResponse for consistency.
"""

from typing import TypeVar, Generic, Optional, Any, Dict, List
from pydantic import BaseModel, Field
from datetime import datetime

T = TypeVar('T')


class ApiResponse(BaseModel, Generic[T]):
    """
    Unified API response wrapper.
    
    All API endpoints should return this format:
    {
        "success": true/false,
        "data": <payload or null>,
        "error": <error message or null>,
        "code": <error code for errors, null for success>,
        "meta": <optional metadata>
    }
    """
    
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None  # Just the message for backward compatibility
    code: Optional[str] = None   # Error code at top level for frontend
    meta: Optional[Dict[str, Any]] = None
    
    @classmethod
    def ok(cls, data: T = None, meta: Dict[str, Any] = None) -> "ApiResponse[T]":
        """Create successful response."""
        return cls(success=True, data=data, meta=meta)
    
    @classmethod
    def fail(
        cls,
        message: str,
        code: str = "ERROR",
    ) -> "ApiResponse":
        """Create error response."""
        return cls(success=False, error=message, code=code)
    
    @classmethod
    def from_exception(cls, exc: "AppException") -> "ApiResponse":
        """Create error response from AppException."""
        from core.exceptions import AppException
        return cls(success=False, error=exc.message, code=exc.code)


# === Pagination ===

class PaginationMeta(BaseModel):
    """Pagination metadata."""
    
    page: int = Field(ge=1)
    per_page: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)
    has_next: bool
    has_prev: bool
    
    @classmethod
    def create(cls, page: int, per_page: int, total: int) -> "PaginationMeta":
        total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
        return cls(
            page=page,
            per_page=per_page,
            total=total,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1
        )


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated list response."""
    
    success: bool = True
    data: List[T]
    meta: PaginationMeta
    
    @classmethod
    def create(
        cls,
        items: List[T],
        page: int,
        per_page: int,
        total: int
    ) -> "PaginatedResponse[T]":
        return cls(
            data=items,
            meta=PaginationMeta.create(page, per_page, total)
        )


# === Common Response Types ===

class IdResponse(BaseModel):
    """Response containing just an ID."""
    id: str


class CountResponse(BaseModel):
    """Response containing a count."""
    count: int


class MessageResponse(BaseModel):
    """Response containing a message."""
    message: str


class TimestampResponse(BaseModel):
    """Response containing a timestamp."""
    timestamp: datetime
