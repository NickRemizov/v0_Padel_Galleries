"""
Middleware package for FastAPI application.
"""

from .auth import AuthMiddleware

__all__ = ["AuthMiddleware"]
