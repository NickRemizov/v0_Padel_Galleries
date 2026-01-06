"""
Auth Router Package
Handles user authentication (Telegram, Google)
"""

from fastapi import APIRouter
from .telegram import router as telegram_router
from .google import router as google_router

router = APIRouter(prefix="/auth", tags=["auth"])
router.include_router(telegram_router)
router.include_router(google_router)
