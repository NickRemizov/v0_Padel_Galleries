"""
Custom exception hierarchy for the application.
All exceptions inherit from AppException for unified handling.
"""

from typing import Optional, Dict, Any


class AppException(Exception):
    """
    Base exception for all application errors.
    
    Attributes:
        message: Human-readable error message
        code: Machine-readable error code
        status_code: HTTP status code for API responses
        details: Additional error details
    """
    
    def __init__(
        self,
        message: str,
        code: str = "ERROR",
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API response."""
        result = {
            "code": self.code,
            "message": self.message,
        }
        if self.details:
            result["details"] = self.details
        return result


# === Not Found Errors ===

class NotFoundError(AppException):
    """Resource not found."""
    
    def __init__(self, entity: str, identifier: str = None):
        message = f"{entity} not found"
        if identifier:
            message = f"{entity} '{identifier}' not found"
        super().__init__(
            message=message,
            code="NOT_FOUND",
            status_code=404
        )


class PersonNotFoundError(NotFoundError):
    def __init__(self, person_id: str):
        super().__init__("Person", person_id)


class FaceNotFoundError(NotFoundError):
    def __init__(self, face_id: str):
        super().__init__("Face", face_id)


class GalleryNotFoundError(NotFoundError):
    def __init__(self, gallery_id: str):
        super().__init__("Gallery", gallery_id)


class PhotoNotFoundError(NotFoundError):
    def __init__(self, photo_id: str):
        super().__init__("Photo", photo_id)


# === Validation Errors ===

class ValidationError(AppException):
    """Input validation failed."""
    
    def __init__(self, message: str, field: str = None, code: str = "VALIDATION_ERROR"):
        details = {"field": field} if field else {}
        super().__init__(
            message=message,
            code=code,
            status_code=422,
            details=details
        )


class InvalidImageError(ValidationError):
    def __init__(self, reason: str = "Invalid or corrupted image"):
        super().__init__(message=reason, field="image")


class InvalidBoundingBoxError(ValidationError):
    def __init__(self):
        super().__init__(message="Invalid bounding box coordinates", field="bbox")


# === Database Errors ===

class DatabaseError(AppException):
    """Database operation failed."""
    
    def __init__(self, message: str, operation: str = None):
        details = {"operation": operation} if operation else {}
        super().__init__(
            message=f"Database error: {message}",
            code="DATABASE_ERROR",
            status_code=500,
            details=details
        )


class ConnectionError(DatabaseError):
    def __init__(self):
        super().__init__(message="Failed to connect to database")


# === Recognition Errors ===

class RecognitionError(AppException):
    """Face recognition operation failed."""
    
    def __init__(self, message: str, phase: str = None):
        details = {"phase": phase} if phase else {}
        super().__init__(
            message=message,
            code="RECOGNITION_ERROR",
            status_code=500,
            details=details
        )


class ModelNotInitializedError(RecognitionError):
    def __init__(self):
        super().__init__(
            message="Face recognition model not initialized",
            phase="initialization"
        )


class NoFacesDetectedError(RecognitionError):
    def __init__(self):
        super().__init__(
            message="No faces detected in image",
            phase="detection"
        )


class IndexNotLoadedError(RecognitionError):
    def __init__(self):
        super().__init__(
            message="Face index not loaded",
            phase="recognition"
        )


# === Authentication Errors ===

class AuthenticationError(AppException):
    """Authentication failed."""
    
    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            status_code=401
        )


class InvalidTokenError(AuthenticationError):
    def __init__(self):
        super().__init__(message="Invalid or expired token")


class InsufficientPermissionsError(AppException):
    """User lacks required permissions."""
    
    def __init__(self, required_permission: str = None):
        message = "Insufficient permissions"
        details = {}
        if required_permission:
            message = f"Permission '{required_permission}' required"
            details["required"] = required_permission
        super().__init__(
            message=message,
            code="FORBIDDEN",
            status_code=403,
            details=details
        )


# === Training Errors ===

class TrainingError(AppException):
    """Training operation failed."""
    
    def __init__(self, message: str, session_id: str = None):
        details = {"session_id": session_id} if session_id else {}
        super().__init__(
            message=message,
            code="TRAINING_ERROR",
            status_code=500,
            details=details
        )


class InsufficientDataError(TrainingError):
    def __init__(self, required: int, actual: int):
        super().__init__(
            message=f"Insufficient training data: need {required}, got {actual}"
        )
