"""
Domain models - core business entities.

These are the source of truth for data structures.
All other layers (requests, responses, repositories) derive from these.
"""

from models.domain.face import Face, BoundingBox, FaceQuality
from models.domain.person import Person, PersonSummary
from models.domain.gallery import Gallery, GalleryImage
from models.domain.training import TrainingSession, TrainingMetrics, TrainingConfig

__all__ = [
    'Face',
    'BoundingBox', 
    'FaceQuality',
    'Person',
    'PersonSummary',
    'Gallery',
    'GalleryImage',
    'TrainingSession',
    'TrainingMetrics',
    'TrainingConfig',
]
