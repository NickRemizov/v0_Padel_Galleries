"""
Application configuration.
Loads from environment variables with validation and defaults.

Uses standard os.getenv() to avoid extra dependencies.
"""

import os
from typing import List, Optional
from dataclasses import dataclass
from functools import lru_cache


# =============================================================================
# Application Version
# =============================================================================
# Single source of truth for version across all modules.
# Update this when deploying new features.
#
# Version history:
#   5.1.0 - 2024-12-27: AuthMiddleware, for_gallery optimization, On-Demand Revalidation
#   5.0.0 - 2024-12-21: All routers migrated to ApiResponse + custom exceptions
#   4.1.0 - Admin router added
#   4.0.0 - Clean architecture refactoring
# =============================================================================

VERSION = "5.1.0"


@dataclass
class Settings:
    """Application settings loaded from environment variables."""
    
    # === Server ===
    server_host: str = "0.0.0.0"
    server_port: int = 8001
    debug: bool = False
    
    # === Supabase ===
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    
    # === CORS ===
    allowed_origins: str = "*"
    
    # === Recognition defaults ===
    default_recognition_threshold: float = 0.60
    default_min_face_size: int = 80
    default_min_blur_score: float = 80.0
    default_min_detection_score: float = 0.70
    
    # === Paths ===
    models_dir: str = "/home/nickr/python/models"
    cache_dir: str = "data/cache"
    uploads_dir: str = "uploads"
    
    # === JWT (for auth) ===
    jwt_secret: Optional[str] = None
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    # === Telegram ===
    telegram_bot_token: Optional[str] = None
    
    @property
    def cors_origins(self) -> List[str]:
        """Parse ALLOWED_ORIGINS into list."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]
    
    @classmethod
    def from_env(cls) -> "Settings":
        """Load settings from environment variables."""
        return cls(
            server_host=os.getenv("SERVER_HOST", "0.0.0.0"),
            server_port=int(os.getenv("SERVER_PORT", "8001")),
            debug=os.getenv("DEBUG", "").lower() in ("true", "1", "yes"),
            supabase_url=os.getenv("SUPABASE_URL", ""),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
            allowed_origins=os.getenv("ALLOWED_ORIGINS", "*"),
            default_recognition_threshold=float(os.getenv("DEFAULT_RECOGNITION_THRESHOLD", "0.60")),
            default_min_face_size=int(os.getenv("DEFAULT_MIN_FACE_SIZE", "80")),
            default_min_blur_score=float(os.getenv("DEFAULT_MIN_BLUR_SCORE", "80.0")),
            default_min_detection_score=float(os.getenv("DEFAULT_MIN_DETECTION_SCORE", "0.70")),
            models_dir=os.getenv("MODELS_DIR", "/home/nickr/python/models"),
            cache_dir=os.getenv("CACHE_DIR", "data/cache"),
            uploads_dir=os.getenv("UPLOADS_DIR", "uploads"),
            jwt_secret=os.getenv("JWT_SECRET"),
            jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
            jwt_expiration_hours=int(os.getenv("JWT_EXPIRATION_HOURS", "24")),
            telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN"),
        )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings.from_env()


# Global settings instance
settings = get_settings()
