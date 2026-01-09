"""
User Router Package
User-facing endpoints (not admin)

v6.1: Added face_service_instance for singleton pattern
"""

from fastapi import APIRouter
from .avatar import router as avatar_router
from .activity import router as activity_router
from .profile import router as profile_router
from .photo_faces import router as photo_faces_router
from .social import router as social_router
from .welcome import router as welcome_router
from .selfie import router as selfie_router

router = APIRouter(prefix="/user", tags=["user"])
router.include_router(profile_router)
router.include_router(photo_faces_router)
router.include_router(social_router)
router.include_router(avatar_router)
router.include_router(activity_router)
router.include_router(welcome_router)
router.include_router(selfie_router)

# Singleton instances (injected from main.py)
face_service_instance = None


def set_services(face_service):
    """Inject service instances from main.py."""
    global face_service_instance
    face_service_instance = face_service
