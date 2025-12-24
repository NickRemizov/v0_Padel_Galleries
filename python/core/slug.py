"""
Slug utilities for human-readable URLs
Supports both UUID and slug identifiers
"""

import re
from uuid import UUID
from typing import Optional, Tuple

# UUID regex pattern
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def is_uuid(value: str) -> bool:
    """Check if a string is a valid UUID."""
    if not value:
        return False
    return bool(UUID_PATTERN.match(value))


def resolve_identifier(
    client,
    table: str,
    identifier: str,
    slug_column: str = "slug",
    select: str = "*"
) -> Optional[dict]:
    """
    Resolve an identifier to a record.
    Tries slug first (if not UUID), then falls back to ID.
    
    Args:
        client: Supabase client
        table: Table name
        identifier: Either UUID or slug
        slug_column: Name of the slug column (default: "slug")
        select: Fields to select
    
    Returns:
        Record dict or None if not found
    """
    # If it looks like a UUID, try ID first
    if is_uuid(identifier):
        result = client.table(table).select(select).eq("id", identifier).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]
        # Also try as slug (in case someone has a UUID-like slug)
        result = client.table(table).select(select).eq(slug_column, identifier).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    
    # Not a UUID - try slug first
    result = client.table(table).select(select).eq(slug_column, identifier).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]
    
    # Fallback: try as ID anyway (for backward compatibility during migration)
    result = client.table(table).select(select).eq("id", identifier).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]
    
    return None


def generate_slug(text: str, max_length: int = 200) -> str:
    """
    Generate a URL-friendly slug from text.
    Supports Cyrillic and Latin characters.
    
    Args:
        text: Source text
        max_length: Maximum slug length
    
    Returns:
        URL-safe slug
    """
    if not text:
        return ""
    
    # Lowercase and replace non-alphanumeric with hyphens
    slug = re.sub(r'[^a-zA-Z0-9а-яёА-ЯЁ]+', '-', text.lower())
    
    # Remove leading/trailing hyphens
    slug = slug.strip('-')
    
    # Remove consecutive hyphens
    slug = re.sub(r'-+', '-', slug)
    
    # Truncate to max length
    return slug[:max_length]
