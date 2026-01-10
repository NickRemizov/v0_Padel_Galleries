"""
BiRefNet Background Removal Service.
Calls BiRefNet worker script with separate venv via subprocess.
"""

import os
import subprocess
import tempfile
import uuid
from typing import Optional
from PIL import Image
import io
import httpx

from core.logging import get_logger

logger = get_logger(__name__)

# Path to BiRefNet venv and worker script
BIREFNET_VENV = "/home/nickr/birefnet_venv"
BIREFNET_PYTHON = f"{BIREFNET_VENV}/bin/python"
BIREFNET_WORKER = "/home/nickr/python/scripts/birefnet_worker.py"


class BiRefNetService:
    """Service for background removal using BiRefNet."""

    def __init__(self):
        self.temp_dir = tempfile.gettempdir()
        self._check_installation()

    def _check_installation(self):
        """Verify BiRefNet venv is available."""
        if not os.path.exists(BIREFNET_PYTHON):
            logger.warning(f"BiRefNet venv not found at {BIREFNET_VENV}")
        else:
            logger.info("BiRefNet service initialized")

    def remove_background_from_bytes(self, image_bytes: bytes) -> Optional[bytes]:
        """
        Remove background from image bytes.

        Args:
            image_bytes: Input image as bytes (JPEG, PNG, WebP)

        Returns:
            PNG bytes with transparent background, or None on error
        """
        # Create temp files
        input_id = uuid.uuid4().hex[:8]
        input_path = os.path.join(self.temp_dir, f"birefnet_in_{input_id}.jpg")
        output_path = os.path.join(self.temp_dir, f"birefnet_out_{input_id}.png")

        try:
            # Save input to temp file
            with open(input_path, 'wb') as f:
                f.write(image_bytes)

            # Call worker script
            result = subprocess.run(
                [BIREFNET_PYTHON, BIREFNET_WORKER, input_path, output_path],
                capture_output=True,
                text=True,
                timeout=120  # 2 minute timeout for CPU inference
            )

            if result.returncode != 0:
                logger.error(f"BiRefNet worker failed: {result.stderr}")
                return None

            # Read output
            if not os.path.exists(output_path):
                logger.error("BiRefNet worker did not create output file")
                return None

            with open(output_path, 'rb') as f:
                output_bytes = f.read()

            logger.info(f"Background removed: {len(image_bytes)} -> {len(output_bytes)} bytes")
            return output_bytes

        except subprocess.TimeoutExpired:
            logger.error("BiRefNet worker timed out")
            return None
        except Exception as e:
            logger.error(f"BiRefNet error: {e}")
            return None
        finally:
            # Cleanup temp files
            if os.path.exists(input_path):
                os.remove(input_path)
            if os.path.exists(output_path):
                os.remove(output_path)

    async def remove_background_from_url(self, image_url: str) -> Optional[bytes]:
        """
        Download image from URL and remove background.

        Args:
            image_url: URL to image

        Returns:
            PNG bytes with transparent background, or None on error
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url, timeout=30)
                response.raise_for_status()
                image_bytes = response.content
        except Exception as e:
            logger.error(f"Failed to download image from {image_url}: {e}")
            return None

        return self.remove_background_from_bytes(image_bytes)

    def crop_face_from_image(
        self,
        image_bytes: bytes,
        bbox: list,
        padding: float = 0.3
    ) -> bytes:
        """
        Crop face region from image with padding.

        Args:
            image_bytes: Full image bytes
            bbox: Face bounding box [x1, y1, x2, y2]
            padding: Padding ratio around face (0.3 = 30% on each side)

        Returns:
            Cropped image bytes (JPEG)
        """
        image = Image.open(io.BytesIO(image_bytes))
        img_w, img_h = image.size

        x1, y1, x2, y2 = bbox
        face_w = x2 - x1
        face_h = y2 - y1

        # Add padding
        pad_x = face_w * padding
        pad_y = face_h * padding

        # Calculate crop region
        crop_x1 = max(0, int(x1 - pad_x))
        crop_y1 = max(0, int(y1 - pad_y))
        crop_x2 = min(img_w, int(x2 + pad_x))
        crop_y2 = min(img_h, int(y2 + pad_y))

        # Crop
        cropped = image.crop((crop_x1, crop_y1, crop_x2, crop_y2))

        # Convert to bytes
        output = io.BytesIO()
        cropped.save(output, format='JPEG', quality=95)
        return output.getvalue()


# Singleton instance
_birefnet_service: Optional[BiRefNetService] = None


def get_birefnet_service() -> BiRefNetService:
    """Get singleton BiRefNet service instance."""
    global _birefnet_service
    if _birefnet_service is None:
        _birefnet_service = BiRefNetService()
    return _birefnet_service
