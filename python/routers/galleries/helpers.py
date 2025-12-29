"""
Galleries Helper Functions
"""

from typing import Optional

from core.exceptions import NotFoundError
from core.slug import resolve_identifier


def _resolve_gallery(supabase_client, identifier: str, select: str = "*") -> Optional[dict]:
    """Resolve gallery by ID or slug."""
    return resolve_identifier(
        supabase_client,
        "galleries",
        identifier,
        slug_column="slug",
        select=select
    )


def _get_gallery_id(supabase_client, identifier: str) -> str:
    """Get gallery ID from identifier (ID or slug). Raises NotFoundError if not found."""
    gallery = _resolve_gallery(supabase_client, identifier)
    if not gallery:
        raise NotFoundError("Gallery", identifier)
    return gallery["id"]
