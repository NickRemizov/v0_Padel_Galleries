"""
People API - Pydantic Models
Request/Response models for people endpoints
"""

from pydantic import BaseModel, field_validator
from typing import Optional, List
import re


class PersonCreate(BaseModel):
    real_name: str
    gmail: Optional[str] = None
    telegram_name: Optional[str] = None
    telegram_nickname: Optional[str] = None
    telegram_profile_url: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[float] = None
    avatar_url: Optional[str] = None
    show_in_players_gallery: bool = True
    show_photos_in_galleries: bool = True

    @field_validator('gmail')
    @classmethod
    def validate_gmail(cls, v):
        if v is not None and v != '':
            if not re.match(r'^[a-zA-Z0-9._%+-]+@gmail\.com$', v):
                raise ValueError('Gmail must be a valid @gmail.com address')
        return v or None


class PersonUpdate(BaseModel):
    real_name: Optional[str] = None
    gmail: Optional[str] = None
    telegram_name: Optional[str] = None
    telegram_nickname: Optional[str] = None
    telegram_profile_url: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[float] = None
    avatar_url: Optional[str] = None
    show_in_players_gallery: Optional[bool] = None
    show_photos_in_galleries: Optional[bool] = None

    @field_validator('gmail')
    @classmethod
    def validate_gmail(cls, v):
        if v is not None and v != '':
            if not re.match(r'^[a-zA-Z0-9._%+-]+@gmail\.com$', v):
                raise ValueError('Gmail must be a valid @gmail.com address')
        return v or None


class VisibilityUpdate(BaseModel):
    show_in_players_gallery: Optional[bool] = None
    show_photos_in_galleries: Optional[bool] = None
