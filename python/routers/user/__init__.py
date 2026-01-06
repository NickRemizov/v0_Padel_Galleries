"""
User Router Package
User-facing endpoints (not admin)
"""

from fastapi import APIRouter
from .avatar import router as avatar_router
from .activity import router as activity_router
from .profile import router as profile_router
from .photo_faces import router as photo_faces_router
from .social import router as social_router

router = APIRouter(prefix="/user", tags=["user"])
router.include_router(profile_router)
router.include_router(photo_faces_router)
router.include_router(social_router)
router.include_router(avatar_router)
router.include_router(activity_router)
