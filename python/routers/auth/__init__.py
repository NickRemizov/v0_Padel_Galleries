"""
Auth Router Package
Handles user authentication (Telegram)
"""

from fastapi import APIRouter
from .telegram import router as telegram_router

router = APIRouter(prefix="/auth", tags=["auth"])
router.include_router(telegram_router)
