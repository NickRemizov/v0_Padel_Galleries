"""
User Router Package
User-facing endpoints (not admin)
"""

from fastapi import APIRouter
from .avatar import router as avatar_router

router = APIRouter(prefix="/user", tags=["user"])
router.include_router(avatar_router)
