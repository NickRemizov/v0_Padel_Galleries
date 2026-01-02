"""
MinIO Storage Service.
Handles file uploads and deletions in MinIO S3-compatible storage.
"""

import os
import uuid
import io
from datetime import timedelta
from typing import Optional
from urllib.parse import unquote, quote

from minio import Minio
from minio.error import S3Error

from core.logging import get_logger

logger = get_logger(__name__)


class MinioStorage:
    """MinIO storage service for file operations."""

    def __init__(self):
        self.endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9200")
        self.access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        self.secret_key = os.getenv("MINIO_SECRET_KEY", "2o5CBBoM/ynAEcrcxViXmvcqDs4UAFXj")
        self.bucket = os.getenv("MINIO_BUCKET", "galleries")
        self.public_url = os.getenv("MINIO_PUBLIC_URL", "https://api.vlcpadel.com/storage")

        self.client = Minio(
            endpoint=self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=False
        )

        logger.info(f"MinIO storage initialized: {self.endpoint}/{self.bucket}")

    def upload_file(
        self,
        file_data: bytes,
        filename: str,
        content_type: str = "image/jpeg",
        folder: str = ""
    ) -> dict:
        """
        Upload file to MinIO.

        Args:
            file_data: File bytes
            filename: Original filename (stored in DB, not in MinIO filename)
            content_type: MIME type
            folder: Optional subfolder (not used - flat structure)

        Returns:
            Dict with url and object_name
        """
        # Generate clean UUID-based filename
        ext = os.path.splitext(filename)[1].lower() or ".jpg"
        unique_id = uuid.uuid4().hex[:12]
        object_name = f"{unique_id}{ext}"

        try:
            self.client.put_object(
                bucket_name=self.bucket,
                object_name=object_name,
                data=io.BytesIO(file_data),
                length=len(file_data),
                content_type=content_type
            )

            # Clean UUID filenames don't need URL encoding
            url = f"{self.public_url}/{self.bucket}/{object_name}"

            logger.info(f"Uploaded: {object_name} ({len(file_data)} bytes)")

            return {
                "url": url,
                "object_name": object_name,
                "size": len(file_data)
            }

        except S3Error as e:
            logger.error(f"MinIO upload error: {e}")
            raise

    def delete_file(self, url: str) -> bool:
        """
        Delete file from MinIO by URL.

        Args:
            url: Public URL of the file

        Returns:
            True if deleted, False otherwise
        """
        try:
            # Extract object name from URL
            # URL format: https://api.vlcpadel.com/storage/galleries/filename.jpg
            if self.public_url in url:
                path = url.replace(f"{self.public_url}/", "")
                # Remove bucket prefix if present
                if path.startswith(f"{self.bucket}/"):
                    object_name = path[len(self.bucket) + 1:]
                else:
                    object_name = path
            else:
                logger.warning(f"URL not from MinIO: {url}")
                return False

            object_name = unquote(object_name)

            self.client.remove_object(
                bucket_name=self.bucket,
                object_name=object_name
            )

            logger.info(f"Deleted: {object_name}")
            return True

        except S3Error as e:
            logger.error(f"MinIO delete error: {e}")
            return False

    def file_exists(self, object_name: str) -> bool:
        """Check if file exists in MinIO."""
        try:
            self.client.stat_object(
                bucket_name=self.bucket,
                object_name=object_name
            )
            return True
        except S3Error:
            return False

    def generate_presigned_upload_url(
        self,
        filename: str,
        expires_seconds: int = 60
    ) -> dict:
        """
        Generate presigned URL for direct upload to MinIO.

        Args:
            filename: Original filename (for extension)
            expires_seconds: URL validity in seconds (default 60)

        Returns:
            Dict with upload_url, object_name, public_url
        """
        ext = os.path.splitext(filename)[1].lower() or ".jpg"
        unique_id = uuid.uuid4().hex[:12]
        object_name = f"{unique_id}{ext}"

        try:
            upload_url = self.client.presigned_put_object(
                bucket_name=self.bucket,
                object_name=object_name,
                expires=timedelta(seconds=expires_seconds)
            )

            public_url = f"{self.public_url}/{self.bucket}/{object_name}"

            logger.info(f"Generated presigned URL for {object_name} (expires {expires_seconds}s)")

            return {
                "upload_url": upload_url,
                "object_name": object_name,
                "public_url": public_url
            }

        except S3Error as e:
            logger.error(f"MinIO presign error: {e}")
            raise


# Singleton instance
_minio_storage: Optional[MinioStorage] = None


def get_minio_storage() -> MinioStorage:
    """Get singleton MinIO storage instance."""
    global _minio_storage
    if _minio_storage is None:
        _minio_storage = MinioStorage()
    return _minio_storage
