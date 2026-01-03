#!/usr/bin/env python3
"""
Migration script: Vercel Blob -> MinIO

Migrates:
- Gallery cover images (cover_image_url, cover_image_square_url)
- Player avatars (avatar_url)
"""

import os
import sys
import httpx
import hashlib
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# MinIO config
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "padel")
MINIO_PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "https://api.vlcpadel.com/storage")

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

from minio import Minio
from supabase import create_client

def get_minio_client():
    return Minio(
        endpoint=MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False  # localhost
    )

def get_supabase_client():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def download_image(url: str) -> bytes | None:
    """Download image from URL"""
    try:
        response = httpx.get(url, follow_redirects=True, timeout=30)
        if response.status_code == 200:
            return response.content
        print(f"  Failed to download {url}: {response.status_code}")
        return None
    except Exception as e:
        print(f"  Error downloading {url}: {e}")
        return None

def upload_to_minio(minio_client: Minio, data: bytes, folder: str, original_url: str) -> str | None:
    """Upload image to MinIO, return new URL"""
    try:
        # Generate short hash for filename
        ext = Path(original_url.split('?')[0]).suffix or '.jpg'
        if not ext.startswith('.'):
            ext = '.jpg'

        hash_name = hashlib.md5(original_url.encode()).hexdigest()[:12]
        object_name = f"{folder}/{hash_name}{ext}"

        # Check if already exists
        try:
            minio_client.stat_object(MINIO_BUCKET, object_name)
            print(f"  Already exists: {object_name}")
            return f"{MINIO_PUBLIC_URL}/{object_name}"
        except:
            pass

        # Upload
        from io import BytesIO
        content_type = "image/jpeg" if ext in ['.jpg', '.jpeg'] else "image/png"

        minio_client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            data=BytesIO(data),
            length=len(data),
            content_type=content_type
        )

        new_url = f"{MINIO_PUBLIC_URL}/{object_name}"
        print(f"  Uploaded: {object_name}")
        return new_url
    except Exception as e:
        print(f"  Error uploading: {e}")
        return None

def migrate_galleries(supabase, minio_client, dry_run=True):
    """Migrate gallery cover images"""
    print("\n=== Migrating Gallery Covers ===")

    result = supabase.table("galleries").select("id, title, cover_image_url, cover_image_square_url").execute()
    galleries = result.data or []

    migrated = 0
    for g in galleries:
        updates = {}

        # Cover image
        if g.get('cover_image_url') and 'vercel' in g['cover_image_url']:
            print(f"\n{g['title'][:40]}:")
            print(f"  Cover: {g['cover_image_url'][:60]}...")

            if not dry_run:
                data = download_image(g['cover_image_url'])
                if data:
                    new_url = upload_to_minio(minio_client, data, "galleries", g['cover_image_url'])
                    if new_url:
                        updates['cover_image_url'] = new_url

        # Square cover
        if g.get('cover_image_square_url') and 'vercel' in g['cover_image_square_url']:
            print(f"  Square: {g['cover_image_square_url'][:60]}...")

            if not dry_run:
                data = download_image(g['cover_image_square_url'])
                if data:
                    new_url = upload_to_minio(minio_client, data, "galleries", g['cover_image_square_url'])
                    if new_url:
                        updates['cover_image_square_url'] = new_url

        # Update DB
        if updates and not dry_run:
            supabase.table("galleries").update(updates).eq("id", g['id']).execute()
            migrated += 1
            print(f"  ✓ Updated DB")

    print(f"\nGalleries migrated: {migrated}")
    return migrated

def migrate_avatars(supabase, minio_client, dry_run=True):
    """Migrate player avatars"""
    print("\n=== Migrating Player Avatars ===")

    result = supabase.table("people").select("id, real_name, avatar_url").execute()
    people = result.data or []

    migrated = 0
    for p in people:
        if p.get('avatar_url') and 'vercel' in p['avatar_url']:
            print(f"\n{p['real_name'][:30]}:")
            print(f"  Avatar: {p['avatar_url'][:60]}...")

            if not dry_run:
                data = download_image(p['avatar_url'])
                if data:
                    new_url = upload_to_minio(minio_client, data, "avatars", p['avatar_url'])
                    if new_url:
                        supabase.table("people").update({"avatar_url": new_url}).eq("id", p['id']).execute()
                        migrated += 1
                        print(f"  ✓ Updated DB")

    print(f"\nAvatars migrated: {migrated}")
    return migrated

def main():
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv

    if dry_run:
        print("=== DRY RUN MODE (no changes) ===")
    else:
        print("=== LIVE MODE (will migrate) ===")

    # Check MinIO config
    if not MINIO_ACCESS_KEY or not MINIO_SECRET_KEY:
        print("\nERROR: MINIO_ACCESS_KEY and MINIO_SECRET_KEY required in .env")
        print("Add these to /home/nickr/python/.env")
        sys.exit(1)

    supabase = get_supabase_client()
    minio_client = get_minio_client()

    # Test MinIO connection
    try:
        minio_client.list_buckets()
        print(f"✓ MinIO connected: {MINIO_ENDPOINT}")
    except Exception as e:
        print(f"ERROR: MinIO connection failed: {e}")
        sys.exit(1)

    # Migrate
    migrate_galleries(supabase, minio_client, dry_run)
    migrate_avatars(supabase, minio_client, dry_run)

    if dry_run:
        print("\n=== Run without --dry-run to actually migrate ===")

if __name__ == "__main__":
    main()
