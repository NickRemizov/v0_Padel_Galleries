"""
Application configuration via Pydantic Settings.
Loads from environment variables with validation and defaults.
"""

import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # === Server ===
    server_host: str = Field(default="0.0.0.0", alias="SERVER_HOST")
    server_port: int = Field(default=8001, alias="SERVER_PORT")
    debug: bool = Field(default=False, alias="DEBUG")
    
    # === Supabase ===
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")
    
    # === CORS ===
    allowed_origins: str = Field(default="*", alias="ALLOWED_ORIGINS")
    
    # === Recognition defaults ===
    default_recognition_threshold: float = Field(default=0.60)
    default_min_face_size: int = Field(default=80)
    default_min_blur_score: float = Field(default=80.0)
    default_min_detection_score: float = Field(default=0.70)
    
    # === Paths ===
    models_dir: str = Field(default="/home/nickr/python/models", alias="MODELS_DIR")
    cache_dir: str = Field(default="data/cache", alias="CACHE_DIR")
    uploads_dir: str = Field(default="uploads", alias="UPLOADS_DIR")
    
    # === JWT (for auth) ===
    jwt_secret: Optional[str] = Field(default=None, alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expiration_hours: int = Field(default=24, alias="JWT_EXPIRATION_HOURS")
    
    @property
    def cors_origins(self) -> List[str]:
        """Parse ALLOWED_ORIGINS into list."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # Ignore extra env vars


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
