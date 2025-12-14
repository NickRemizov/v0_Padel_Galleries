"""
Models package - data structures for the application.

Subpackages:
- domain/ - Domain models (core business entities)
- requests/ - Request DTOs (API input)
- responses/ - Response DTOs (API output)

Legacy:
- schemas.py - Old schemas (to be migrated)
"""

# Re-export commonly used models
from models.domain.face import Face, BoundingBox, FaceQuality
from models.domain.person import Person, PersonSummary
from models.domain.gallery import Gallery, GalleryImage
from models.domain.training import TrainingSession, TrainingMetrics

__all__ = [
    # Face
    'Face',
    'BoundingBox',
    'FaceQuality',
    # Person
    'Person',
    'PersonSummary',
    # Gallery
    'Gallery',
    'GalleryImage',
    # Training
    'TrainingSession',
    'TrainingMetrics',
]
