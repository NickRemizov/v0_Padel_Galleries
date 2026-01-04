"""
Descriptor Router Package
Descriptor generation and regeneration endpoints

v2.0: Modular structure (refactored from monolithic descriptors.py)
v2.1: Removed dead /generate-descriptors endpoint

Endpoints:
- GET /missing-descriptors-count
- GET /missing-descriptors-list
- POST /regenerate-missing-descriptors
- POST /regenerate-single-descriptor
- POST /regenerate-unknown-descriptors
"""

from fastapi import APIRouter

# Create main router
router = APIRouter()

# Import sub-routers
from .query import router as query_router
from .regenerate import router as regenerate_router

# Include all sub-routers
# query first (GET endpoints), then regenerate (POST endpoints)
router.include_router(query_router)
router.include_router(regenerate_router)

# Export
__all__ = ["router"]
