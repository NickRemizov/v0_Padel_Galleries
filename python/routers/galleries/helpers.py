"""
Galleries Helper Functions
"""

from typing import Optional

from core.exceptions import NotFoundError
from core.slug import resolve_identifier


def get_supabase_db():
    """Get supabase_db instance from package globals."""
    from . import supabase_db_instance
    return supabase_db_instance


def get_face_service():
    """Get face_service instance from package globals."""
    from . import face_service_instance
    return face_service_instance


def _resolve_gallery(identifier: str, select: str = "*") -> Optional[dict]:
    """Resolve gallery by ID or slug."""
    supabase_db = get_supabase_db()
    return resolve_identifier(
        supabase_db.client,
        "galleries",
        identifier,
        slug_column="slug",
        select=select
    )


def _get_gallery_id(identifier: str) -> str:
    """Get gallery ID from identifier (ID or slug). Raises NotFoundError if not found."""
    gallery = _resolve_gallery(identifier)
    if not gallery:
        raise NotFoundError("Gallery", identifier)
    return gallery["id"]
