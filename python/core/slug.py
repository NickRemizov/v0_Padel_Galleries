"""
Slug utilities for human-readable URLs.

Slug format rules:
- Latin letters (upper/lower case preserved)
- Digits, hyphens, underscores allowed
- Spaces → underscores
- Cyrillic → transliterated to Latin (case preserved)
- Duplicates get suffix _02, _03, etc.
"""

import re
import os
from uuid import UUID
from typing import Optional

# UUID regex pattern
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)

# Cyrillic to Latin transliteration map (lowercase)
TRANSLIT_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    # Ukrainian specific
    'і': 'i', 'ї': 'yi', 'є': 'ye', 'ґ': 'g',
}


def transliterate(text: str) -> str:
    """
    Transliterate Cyrillic to Latin, preserving case.
    Non-cyrillic characters pass through unchanged.
    """
    result = []
    for char in text:
        lower_char = char.lower()
        if lower_char in TRANSLIT_MAP:
            translit = TRANSLIT_MAP[lower_char]
            # Preserve case: if original was uppercase, capitalize first letter
            if char.isupper() and translit:
                translit = translit[0].upper() + translit[1:]
            result.append(translit)
        else:
            result.append(char)
    return ''.join(result)


def to_slug(text: str, max_length: int = 200) -> str:
    """
    Convert text to URL-friendly slug.

    Rules:
    - Transliterate Cyrillic → Latin
    - Preserve case
    - Spaces → underscores
    - Keep only: letters, digits, hyphens, underscores
    - Remove file extensions (.jpg, .png, etc.)

    Args:
        text: Source text (name, title, filename)
        max_length: Maximum slug length

    Returns:
        URL-safe slug
    """
    if not text:
        return ""

    # Remove common file extensions
    text = re.sub(r'\.(jpg|jpeg|png|gif|webp|heic|heif)$', '', text, flags=re.IGNORECASE)

    # Transliterate Cyrillic
    text = transliterate(text)

    # Handle dots: ". " → " ", "." → "_"
    text = text.replace('. ', ' ')
    text = text.replace('.', '_')

    # Replace spaces with underscores
    text = text.replace(' ', '_')

    # Keep only allowed characters: letters, digits, hyphens, underscores
    text = re.sub(r'[^a-zA-Z0-9_-]', '', text)

    # Collapse consecutive underscores/hyphens into single one
    text = re.sub(r'[_-]+', lambda m: m.group()[0], text)

    # Remove leading/trailing underscores/hyphens
    text = text.strip('_-')

    return text[:max_length]


def make_unique_slug(
    base_slug: str,
    existing_slugs: set,
    exclude_id: Optional[str] = None
) -> str:
    """
    Make slug unique by adding _02, _03 suffix if needed.

    Args:
        base_slug: The generated slug
        existing_slugs: Set of slugs already in use
        exclude_id: ID to exclude from uniqueness check (for updates)

    Returns:
        Unique slug
    """
    if base_slug not in existing_slugs:
        return base_slug

    # Find next available index
    index = 2
    while True:
        candidate = f"{base_slug}_{index:02d}"
        if candidate not in existing_slugs:
            return candidate
        index += 1
        if index > 99:
            # Fallback: add more digits
            candidate = f"{base_slug}_{index}"
            if candidate not in existing_slugs:
                return candidate


# === Entity-specific slug generators ===

def generate_gallery_slug(title: str, shoot_date: str = None) -> str:
    """
    Generate slug for gallery from title and date.

    Format: title_DD-MM-YY
    Example: "Bullpadel League" + "2025-11-08" → "Bullpadel_League_08-11-25"

    Args:
        title: Gallery title
        shoot_date: Date in ISO format (YYYY-MM-DD) or datetime string

    Returns:
        Slug in format title_DD-MM-YY
    """
    title_slug = to_slug(title)

    if shoot_date:
        try:
            # Parse date - handle both "2025-11-08" and "2025-11-08T00:00:00"
            date_str = shoot_date[:10] if len(shoot_date) >= 10 else shoot_date
            parts = date_str.split("-")
            if len(parts) == 3:
                year, month, day = parts
                date_suffix = f"{day}-{month}-{year[2:]}"
                return f"{title_slug}_{date_suffix}"
        except Exception:
            pass

    return title_slug


def generate_photo_slug(original_filename: str) -> str:
    """Generate slug for photo from original filename."""
    return to_slug(original_filename)


def generate_player_slug(
    name: str,
    telegram_username: Optional[str] = None
) -> str:
    """
    Generate slug for player.

    Priority:
    1. Telegram username (without @)
    2. Transliterated name

    Args:
        name: Player's display name
        telegram_username: Telegram username (with or without @)

    Returns:
        Slug for player URL
    """
    if telegram_username:
        # Remove @ if present, keep as-is (TG usernames are already Latin)
        username = telegram_username.lstrip('@').strip()
        if username:
            # TG usernames can have underscores, just sanitize
            return re.sub(r'[^a-zA-Z0-9_]', '', username)

    # Fallback to transliterated name
    return to_slug(name)


# === Resolver (unchanged) ===

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


# Keep old function name for compatibility
def generate_slug(text: str, max_length: int = 200) -> str:
    """Deprecated: use to_slug() instead."""
    return to_slug(text, max_length)
