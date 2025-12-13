"""
BACKWARD COMPATIBILITY WRAPPER

This file maintains backward compatibility for:
    from routers.recognition import router, set_services

The actual implementation is in the recognition/ package.
After migration is stable, this file can be removed.
"""

# Import from the new package structure
from routers.recognition import (
    router,
    set_services,
    face_service_instance,
    supabase_client_instance,
)

# Re-export schemas for backward compatibility
from models.recognition_schemas import (
    DetectFacesRequest,
    RecognizeFaceRequest,
    BatchRecognizeRequest,
    GenerateDescriptorsRequest,
    ProcessPhotoRequest,
    ProcessPhotoResponse,
    FaceDetectionResponse,
    FaceRecognitionResponse,
)

# Re-export utility functions
from utils.geometry import calculate_iou, generate_face_crop_url

__all__ = [
    # Router and DI
    'router',
    'set_services',
    'face_service_instance',
    'supabase_client_instance',
    # Schemas
    'DetectFacesRequest',
    'RecognizeFaceRequest',
    'BatchRecognizeRequest',
    'GenerateDescriptorsRequest',
    'ProcessPhotoRequest',
    'ProcessPhotoResponse',
    'FaceDetectionResponse',
    'FaceRecognitionResponse',
    # Utils
    'calculate_iou',
    'generate_face_crop_url',
]
