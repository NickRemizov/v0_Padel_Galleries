"""
Recognition router package.
Combines all sub-routers into a single router for mounting in main.py.

Structure:
- detect.py: /detect-faces, /process-photo
- recognize.py: /recognize-face
- clusters.py: /cluster-unknown-faces, /reject-face-cluster
- descriptors/: /generate-descriptors, /missing-descriptors-*, /regenerate-*
- maintenance.py: /rebuild-index

v1.1: Modularized descriptors.py into descriptors/ package
"""

from fastapi import APIRouter
import logging

from .dependencies import set_services, face_service_instance, supabase_client_instance
from . import detect
from . import recognize
from . import clusters
from .descriptors import router as descriptors_router  # Now imports from descriptors/ package
from . import maintenance

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Create main router that combines all sub-routers
router = APIRouter()

# Include all sub-routers
router.include_router(detect.router)
router.include_router(recognize.router)
router.include_router(clusters.router)
router.include_router(descriptors_router)  # Changed from descriptors.router
router.include_router(maintenance.router)

# Re-export set_services for main.py compatibility
__all__ = [
    'router',
    'set_services',
    'face_service_instance',
    'supabase_client_instance',
]
