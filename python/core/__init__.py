"""
Core package - foundation for the application.

Modules:
- config.py - Application settings via Pydantic Settings
- exceptions.py - Custom exception hierarchy
- responses.py - Unified API response format
- logging.py - Centralized logging configuration
"""

from core.config import settings
from core.exceptions import (
    AppException,
    NotFoundError,
    ValidationError,
    DatabaseError,
    RecognitionError,
    AuthenticationError,
)
from core.responses import ApiResponse

__all__ = [
    'settings',
    'AppException',
    'NotFoundError',
    'ValidationError',
    'DatabaseError',
    'RecognitionError',
    'AuthenticationError',
    'ApiResponse',
]
