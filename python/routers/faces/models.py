"""
Faces API - Pydantic Models
Request/Response models for faces endpoints
"""

from pydantic import BaseModel
from typing import List, Optional


class SaveFaceRequest(BaseModel):
    photo_id: str
    person_id: Optional[str]
    bounding_box: Optional[dict]
    embedding: List[float]
    confidence: Optional[float]
    recognition_confidence: Optional[float]
    verified: bool


class UpdateFaceRequest(BaseModel):
    face_id: str
    person_id: Optional[str]
    verified: Optional[bool]
    recognition_confidence: Optional[float]


class DeleteFaceRequest(BaseModel):
    face_id: str


class BatchSaveFaceRequest(BaseModel):
    photo_id: str
    faces: List[SaveFaceRequest]


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
