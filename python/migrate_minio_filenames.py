"""
MinIO Filename Migration Script.

Renames files in MinIO from UUID-only to slug+UUID format.
Also fixes double /storage/storage/ in URLs.

Target URL format:
https://api.vlcpadel.com/storage/photos/{original_filename_slug}_{uuid}.jpg

Usage:
    python migrate_minio_filenames.py --dry-run    # Preview changes
    python migrate_minio_filenames.py              # Execute migration
"""

from dotenv import load_dotenv
load_dotenv()

import os
import sys
import argparse
from minio import Minio
from minio.error import S3Error
from minio.commonconfig import CopySource

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.slug import to_slug
from services.supabase.base import get_supabase_client

# Configuration
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9200")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "2o5CBBoM/ynAEcrcxViXmvcqDs4UAFXj")
MINIO_BUCKET = "storage"
# Buckets: photos, covers, avatars (each is a separate bucket)
PUBLIC_URL_BASE = "https://api.vlcpadel.com/storage"

# Slug length limit
MAX_SLUG_LENGTH = 80


def get_minio_client():
    """Create MinIO client."""
    return Minio(
        endpoint=MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False
    )


def extract_uuid_from_url(url: str) -> str:
    """Extract UUID (12 chars) from URL like .../photos/abc123def456.jpg"""
    if not url:
        return None
    # Get filename from URL
    filename = url.split('/')[-1]
    # Remove extension
    name = os.path.splitext(filename)[0]
    # Return the UUID part (should be 12 hex chars)
    if len(name) == 12 and all(c in '0123456789abcdef' for c in name.lower()):
        return name
    return None


def get_folder_from_url(url: str) -> str:
    """Extract folder (photos, covers, avatars) from URL."""
    if '/photos/' in url:
        return 'photos'
    elif '/covers/' in url:
        return 'covers'
    elif '/avatars/' in url:
        return 'avatars'
    return None


def generate_new_filename(original_filename: str, uuid_part: str, ext: str) -> str:
    """
    Generate new filename: {slug}_{uuid}.{ext}

    Args:
        original_filename: Original file name (e.g., "IMG_20251123_143256.jpg")
        uuid_part: 12-char UUID
        ext: File extension with dot (e.g., ".jpg")
    """
    # Generate slug from original filename (without extension)
    name_without_ext = os.path.splitext(original_filename)[0]
    slug = to_slug(name_without_ext, max_length=MAX_SLUG_LENGTH)

    # If slug is empty, use "image" as fallback
    if not slug:
        slug = "image"

    return f"{slug}_{uuid_part}{ext}"


def migrate_gallery_images(supabase, minio_client, dry_run=True):
    """Migrate gallery_images table."""
    print("\n=== Migrating gallery_images ===")

    # Fetch all images
    page_size = 1000
    offset = 0
    total_migrated = 0
    total_errors = 0

    while True:
        result = supabase.table("gallery_images").select(
            "id, image_url, original_url, original_filename"
        ).range(offset, offset + page_size - 1).execute()

        if not result.data:
            break

        for img in result.data:
            try:
                image_url = img.get('image_url', '')
                original_url = img.get('original_url', '')
                original_filename = img.get('original_filename', '')

                if not image_url or not original_filename:
                    continue

                # Extract UUID from current URL
                uuid_part = extract_uuid_from_url(image_url)
                if not uuid_part:
                    print(f"  SKIP: Cannot extract UUID from {image_url}")
                    continue

                # Get folder and extension
                folder = get_folder_from_url(image_url)
                if not folder:
                    folder = 'photos'

                ext = os.path.splitext(image_url)[1].lower() or '.jpg'

                # Generate new filename
                new_filename = generate_new_filename(original_filename, uuid_part, ext)

                # Old and new object names in MinIO
                old_object = f"{folder}/{uuid_part}{ext}"
                new_object = f"{folder}/{new_filename}"

                # New URL (with single /storage/)
                new_url = f"{PUBLIC_URL_BASE}/{new_object}"

                # Same for original_url if it exists
                new_original_url = original_url
                if original_url:
                    orig_uuid = extract_uuid_from_url(original_url)
                    if orig_uuid:
                        orig_folder = get_folder_from_url(original_url) or folder
                        orig_ext = os.path.splitext(original_url)[1].lower() or ext
                        orig_new_filename = generate_new_filename(original_filename, orig_uuid, orig_ext)
                        new_original_url = f"{PUBLIC_URL_BASE}/{orig_folder}/{orig_new_filename}"

                if dry_run:
                    print(f"  [DRY-RUN] {img['id'][:8]}...")
                    print(f"    MinIO: {old_object} -> {new_object}")
                    print(f"    URL:   {image_url}")
                    print(f"      ->   {new_url}")
                else:
                    # Copy object with new name
                    try:
                        minio_client.copy_object(
                            bucket_name=MINIO_BUCKET,
                            object_name=new_object,
                            source=CopySource(MINIO_BUCKET, old_object)
                        )
                    except S3Error as e:
                        if 'NoSuchKey' in str(e):
                            print(f"  WARN: Source not found: {old_object}")
                            continue
                        raise

                    # Update database
                    update_data = {"image_url": new_url}
                    if new_original_url != original_url:
                        update_data["original_url"] = new_original_url

                    supabase.table("gallery_images").update(
                        update_data
                    ).eq("id", img['id']).execute()

                    # Delete old object
                    try:
                        minio_client.remove_object(bucket_name=MINIO_BUCKET, object_name=old_object)
                    except S3Error:
                        pass  # Ignore if already deleted

                    print(f"  OK: {img['id'][:8]}... -> {new_filename}")

                total_migrated += 1

            except Exception as e:
                print(f"  ERROR: {img.get('id', '?')}: {e}")
                total_errors += 1

        offset += page_size
        if len(result.data) < page_size:
            break

    print(f"\nGallery images: {total_migrated} migrated, {total_errors} errors")
    return total_migrated, total_errors


def migrate_covers(supabase, minio_client, dry_run=True):
    """Migrate gallery cover images."""
    print("\n=== Migrating gallery covers ===")

    result = supabase.table("galleries").select(
        "id, title, cover_image_url, cover_image_square_url"
    ).execute()

    total_migrated = 0
    total_errors = 0

    for gallery in result.data or []:
        try:
            gallery_title = gallery.get('title', '')
            cover_url = gallery.get('cover_image_url', '')
            square_url = gallery.get('cover_image_square_url', '')

            update_data = {}

            # Process cover_image_url
            if cover_url:
                uuid_part = extract_uuid_from_url(cover_url)
                if uuid_part:
                    ext = os.path.splitext(cover_url)[1].lower() or '.jpg'
                    slug = to_slug(f"{gallery_title}_cover", max_length=MAX_SLUG_LENGTH)
                    new_filename = f"{slug}_{uuid_part}{ext}"

                    old_object = f"covers/{uuid_part}{ext}"
                    new_object = f"covers/{new_filename}"
                    new_url = f"{PUBLIC_URL_BASE}/{new_object}"

                    if not dry_run:
                        try:
                            minio_client.copy_object(
                                bucket_name=MINIO_BUCKET,
                                object_name=new_object,
                                source=CopySource(MINIO_BUCKET, old_object)
                            )
                            minio_client.remove_object(bucket_name=MINIO_BUCKET, object_name=old_object)
                        except S3Error as e:
                            if 'NoSuchKey' not in str(e):
                                raise

                    update_data["cover_image_url"] = new_url

            # Process cover_image_square_url
            if square_url:
                uuid_part = extract_uuid_from_url(square_url)
                if uuid_part:
                    ext = os.path.splitext(square_url)[1].lower() or '.jpg'
                    slug = to_slug(f"{gallery_title}_square", max_length=MAX_SLUG_LENGTH)
                    new_filename = f"{slug}_{uuid_part}{ext}"

                    old_object = f"covers/{uuid_part}{ext}"
                    new_object = f"covers/{new_filename}"
                    new_url = f"{PUBLIC_URL_BASE}/{new_object}"

                    if not dry_run:
                        try:
                            minio_client.copy_object(
                                bucket_name=MINIO_BUCKET,
                                object_name=new_object,
                                source=CopySource(MINIO_BUCKET, old_object)
                            )
                            minio_client.remove_object(bucket_name=MINIO_BUCKET, object_name=old_object)
                        except S3Error as e:
                            if 'NoSuchKey' not in str(e):
                                raise

                    update_data["cover_image_square_url"] = new_url

            if update_data:
                if dry_run:
                    print(f"  [DRY-RUN] Gallery {gallery['id'][:8]}... ({gallery_title[:30]})")
                    for key, val in update_data.items():
                        print(f"    {key}: {val}")
                else:
                    supabase.table("galleries").update(
                        update_data
                    ).eq("id", gallery['id']).execute()
                    print(f"  OK: {gallery['id'][:8]}... ({gallery_title[:30]})")

                total_migrated += 1

        except Exception as e:
            print(f"  ERROR: {gallery.get('id', '?')}: {e}")
            total_errors += 1

    print(f"\nGallery covers: {total_migrated} migrated, {total_errors} errors")
    return total_migrated, total_errors


def migrate_avatars(supabase, minio_client, dry_run=True):
    """Migrate people avatar images."""
    print("\n=== Migrating avatars ===")

    result = supabase.table("people").select(
        "id, real_name, telegram_name, avatar_url"
    ).not_.is_("avatar_url", "null").execute()

    total_migrated = 0
    total_errors = 0

    for person in result.data or []:
        try:
            avatar_url = person.get('avatar_url', '')
            name = person.get('real_name') or person.get('telegram_name') or 'unknown'

            if not avatar_url:
                continue

            uuid_part = extract_uuid_from_url(avatar_url)
            if not uuid_part:
                continue

            ext = os.path.splitext(avatar_url)[1].lower() or '.jpg'
            slug = to_slug(f"{name}_avatar", max_length=MAX_SLUG_LENGTH)
            new_filename = f"{slug}_{uuid_part}{ext}"

            old_object = f"avatars/{uuid_part}{ext}"
            new_object = f"avatars/{new_filename}"
            new_url = f"{PUBLIC_URL_BASE}/{new_object}"

            if dry_run:
                print(f"  [DRY-RUN] {person['id'][:8]}... ({name[:20]})")
                print(f"    {avatar_url}")
                print(f"    -> {new_url}")
            else:
                try:
                    minio_client.copy_object(
                        bucket_name=MINIO_BUCKET,
                        object_name=new_object,
                        source=CopySource(MINIO_BUCKET, old_object)
                    )
                    minio_client.remove_object(bucket_name=MINIO_BUCKET, object_name=old_object)
                except S3Error as e:
                    if 'NoSuchKey' not in str(e):
                        raise

                supabase.table("people").update(
                    {"avatar_url": new_url}
                ).eq("id", person['id']).execute()

                print(f"  OK: {person['id'][:8]}... ({name[:20]})")

            total_migrated += 1

        except Exception as e:
            print(f"  ERROR: {person.get('id', '?')}: {e}")
            total_errors += 1

    print(f"\nAvatars: {total_migrated} migrated, {total_errors} errors")
    return total_migrated, total_errors


def main():
    parser = argparse.ArgumentParser(description="Migrate MinIO filenames to slug+UUID format")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")
    parser.add_argument("--photos-only", action="store_true", help="Only migrate gallery photos")
    parser.add_argument("--covers-only", action="store_true", help="Only migrate gallery covers")
    parser.add_argument("--avatars-only", action="store_true", help="Only migrate avatars")
    args = parser.parse_args()

    dry_run = args.dry_run

    print("=" * 60)
    print("MinIO Filename Migration")
    print("=" * 60)
    print(f"Mode: {'DRY-RUN (preview only)' if dry_run else 'LIVE (will modify files)'}")
    print(f"Target format: {{slug}}_{{uuid}}.ext (max slug length: {MAX_SLUG_LENGTH})")
    print()

    # Connect to services
    supabase = get_supabase_client()
    minio_client = get_minio_client()

    # Verify MinIO connection
    try:
        minio_client.list_buckets()
        print("MinIO: Connected")
    except Exception as e:
        print(f"MinIO: Connection failed - {e}")
        return 1

    # Run migrations
    total_migrated = 0
    total_errors = 0

    if not args.covers_only and not args.avatars_only:
        m, e = migrate_gallery_images(supabase, minio_client, dry_run)
        total_migrated += m
        total_errors += e

    if not args.photos_only and not args.avatars_only:
        m, e = migrate_covers(supabase, minio_client, dry_run)
        total_migrated += m
        total_errors += e

    if not args.photos_only and not args.covers_only:
        m, e = migrate_avatars(supabase, minio_client, dry_run)
        total_migrated += m
        total_errors += e

    print("\n" + "=" * 60)
    print(f"TOTAL: {total_migrated} migrated, {total_errors} errors")
    if dry_run:
        print("This was a DRY-RUN. Run without --dry-run to apply changes.")
    print("=" * 60)

    return 0 if total_errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
