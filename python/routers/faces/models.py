"""
Faces API - Pydantic Models
Request/Response models for faces endpoints

v5.0: Cleaned up - removed unused models (SaveFaceRequest, UpdateFaceRequest, DeleteFaceRequest, BatchSaveFaceRequest)
"""

from pydantic import BaseModel
from typing import List, Optional


class BatchPhotoIdsRequest(BaseModel):
    photo_ids: List[str]


class KeptFace(BaseModel):
    id: str
    person_id: Optional[str]


class BatchVerifyRequest(BaseModel):
    photo_id: str
    kept_faces: List[KeptFace]


class RecognizeUnknownRequest(BaseModel):
    gallery_id: Optional[str] = None
    confidence_threshold: Optional[float] = None


class BatchAssignRequest(BaseModel):
    """Request model for batch assigning faces to a person."""
    face_ids: List[str]
    person_id: str
