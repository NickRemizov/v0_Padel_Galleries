"""
Images Pydantic Models
"""

from pydantic import BaseModel
from typing import List


class GalleryImageInput(BaseModel):
    imageUrl: str
    originalUrl: str
    originalFilename: str
    fileSize: int
    width: int
    height: int


class BatchAddImagesRequest(BaseModel):
    galleryId: str
    images: List[GalleryImageInput]


class BatchSortOrderItem(BaseModel):
    id: str
    order: int


class BatchSortOrderRequest(BaseModel):
    image_orders: List[BatchSortOrderItem]
