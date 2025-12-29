"""
Admin Debug Router Package
Debug endpoints for galleries, photos, people, and recognition

v2.0: Modular structure (refactored from monolithic debug.py)
"""

from fastapi import APIRouter

# Create main router
router = APIRouter()

# Import sub-routers
from .gallery import router as gallery_router
from .faces import router as faces_router
from .recognition import router as recognition_router

# Include all sub-routers
# No specific order needed - all routes are unique paths
router.include_router(gallery_router)
router.include_router(faces_router)
router.include_router(recognition_router)

# Export
__all__ = ["router"]
