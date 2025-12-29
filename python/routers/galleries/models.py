"""
Galleries Pydantic Models
"""

from pydantic import BaseModel
from typing import Optional, List


class GalleryCreate(BaseModel):
    title: str
    shoot_date: str
    gallery_url: str
    cover_image_url: str
    cover_image_square_url: Optional[str] = None
    external_gallery_url: Optional[str] = None
    photographer_id: Optional[str] = None
    location_id: Optional[str] = None
    organizer_id: Optional[str] = None
    sort_order: Optional[str] = None


class GalleryUpdate(BaseModel):
    title: Optional[str] = None
    shoot_date: Optional[str] = None
    gallery_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    cover_image_square_url: Optional[str] = None
    external_gallery_url: Optional[str] = None
    photographer_id: Optional[str] = None
    location_id: Optional[str] = None
    organizer_id: Optional[str] = None
    sort_order: Optional[str] = None


class BatchDeleteImagesRequest(BaseModel):
    image_ids: List[str]
    gallery_id: str
