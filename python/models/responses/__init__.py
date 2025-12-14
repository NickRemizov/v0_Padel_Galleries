"""
Response DTOs - API output models.
Used for structuring API responses.
"""

from models.responses.recognition import (
    DetectFacesResponse,
    FaceDetectionResult,
    RecognitionResult,
    ProcessPhotoResponse,
    GroupFacesResponse,
    FaceGroup,
)
from models.responses.training import (
    DatasetStatsResponse,
    TrainingStatusResponse,
    TrainingHistoryResponse,
)

__all__ = [
    # Recognition
    'DetectFacesResponse',
    'FaceDetectionResult',
    'RecognitionResult',
    'ProcessPhotoResponse',
    'GroupFacesResponse',
    'FaceGroup',
    # Training
    'DatasetStatsResponse',
    'TrainingStatusResponse',
    'TrainingHistoryResponse',
]
