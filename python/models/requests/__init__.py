"""
Request DTOs - API input models.
Used for validating incoming API requests.
"""

from models.requests.recognition import (
    DetectFacesRequest,
    RecognizeFaceRequest,
    ProcessPhotoRequest,
    GroupFacesRequest,
    AssignPersonRequest,
)
from models.requests.training import (
    PrepareDatasetRequest,
    ExecuteTrainingRequest,
    TrainingFilters,
    TrainingOptions,
)
from models.requests.common import (
    PaginationParams,
    IdRequest,
)

__all__ = [
    # Recognition
    'DetectFacesRequest',
    'RecognizeFaceRequest',
    'ProcessPhotoRequest',
    'GroupFacesRequest',
    'AssignPersonRequest',
    # Training
    'PrepareDatasetRequest',
    'ExecuteTrainingRequest',
    'TrainingFilters',
    'TrainingOptions',
    # Common
    'PaginationParams',
    'IdRequest',
]
