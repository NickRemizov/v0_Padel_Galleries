"""
User Router Package
User-facing endpoints (not admin)
"""

from fastapi import APIRouter
from .avatar import router as avatar_router
from .activity import router as activity_router

router = APIRouter(prefix="/user", tags=["user"])
router.include_router(avatar_router)
router.include_router(activity_router)
