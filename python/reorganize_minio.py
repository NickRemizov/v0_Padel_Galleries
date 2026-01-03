#!/usr/bin/env python3
"""
Reorganize MinIO storage structure.

From:
  bucket: galleries
    /               → gallery photos
    /galleries/     → covers
    /avatars/       → avatars

To:
  bucket: storage
    /photos/        → gallery photos
    /covers/        → covers
    /avatars/       → avatars
"""

import os
import sys
from io import BytesIO
from dotenv import load_dotenv
from minio import Minio
from supabase import create_client

load_dotenv()

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9200")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "https://api.vlcpadel.com/storage")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

OLD_BUCKET = "galleries"
NEW_BUCKET = "storage"


def get_minio():
    return Minio(
        endpoint=MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False
    )


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def copy_object(minio, src_bucket, src_path, dst_bucket, dst_path):
    """Copy object from source to destination."""
    try:
        # Get object
        response = minio.get_object(bucket_name=src_bucket, object_name=src_path)
        data = response.read()
        response.close()
        response.release_conn()

        # Determine content type
        if src_path.lower().endswith('.jpg') or src_path.lower().endswith('.jpeg'):
            content_type = 'image/jpeg'
        elif src_path.lower().endswith('.png'):
            content_type = 'image/png'
        else:
            content_type = 'application/octet-stream'

        # Put to new location
        minio.put_object(
            bucket_name=dst_bucket,
            object_name=dst_path,
            data=BytesIO(data),
            length=len(data),
            content_type=content_type
        )
        return True
    except Exception as e:
        print(f"  Error copying {src_path}: {e}")
        return False


def main():
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv

    if dry_run:
        print("=== DRY RUN MODE ===")
    else:
        print("=== LIVE MODE ===")

    minio = get_minio()
    supabase = get_supabase()

    # Create new bucket if needed
    if not minio.bucket_exists(bucket_name=NEW_BUCKET):
        if not dry_run:
            minio.make_bucket(bucket_name=NEW_BUCKET)
            # Set public policy
            policy = """{
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": ["arn:aws:s3:::storage/*"]
                }]
            }"""
            minio.set_bucket_policy(bucket_name=NEW_BUCKET, policy=policy)
        print(f"✓ Created bucket: {NEW_BUCKET}")
    else:
        print(f"✓ Bucket exists: {NEW_BUCKET}")

    # 1. Move gallery photos (root level) → photos/
    print("\n=== Moving gallery photos to photos/ ===")
    root_objects = list(minio.list_objects(bucket_name=OLD_BUCKET, prefix='', recursive=False))
    root_files = [o for o in root_objects if not o.is_dir]

    moved_photos = 0
    for obj in root_files:
        src = obj.object_name
        dst = f"photos/{src}"

        if dry_run:
            print(f"  Would move: {src} → {dst}")
        else:
            if copy_object(minio, OLD_BUCKET, src, NEW_BUCKET, dst):
                moved_photos += 1
                if moved_photos % 100 == 0:
                    print(f"  Moved {moved_photos}/{len(root_files)} photos...")

    print(f"Moved {moved_photos} photos")

    # 2. Move covers (galleries/) → covers/
    print("\n=== Moving covers to covers/ ===")
    cover_objects = list(minio.list_objects(bucket_name=OLD_BUCKET, prefix='galleries/', recursive=True))

    moved_covers = 0
    for obj in cover_objects:
        src = obj.object_name  # galleries/xxx.jpg
        filename = src.replace('galleries/', '')
        dst = f"covers/{filename}"

        if dry_run:
            print(f"  Would move: {src} → {dst}")
        else:
            if copy_object(minio, OLD_BUCKET, src, NEW_BUCKET, dst):
                moved_covers += 1

    print(f"Moved {moved_covers} covers")

    # 3. Move avatars (avatars/) → avatars/
    print("\n=== Moving avatars to avatars/ ===")
    avatar_objects = list(minio.list_objects(bucket_name=OLD_BUCKET, prefix='avatars/', recursive=True))

    moved_avatars = 0
    for obj in avatar_objects:
        src = obj.object_name  # avatars/xxx.jpg
        dst = src  # same path in new bucket

        if dry_run:
            print(f"  Would move: {src} → {dst}")
        else:
            if copy_object(minio, OLD_BUCKET, src, NEW_BUCKET, dst):
                moved_avatars += 1

    print(f"Moved {moved_avatars} avatars")

    # 4. Update database URLs
    if not dry_run:
        print("\n=== Updating database URLs ===")

        # Update gallery images
        print("Updating gallery_images...")
        result = supabase.table('gallery_images').select('id, image_url').execute()
        updated = 0
        for img in result.data:
            url = img.get('image_url', '')
            if '/storage/galleries/' in url and '/storage/storage/' not in url:
                # /storage/galleries/xxx.jpg → /storage/storage/photos/xxx.jpg
                new_url = url.replace('/storage/galleries/', '/storage/storage/photos/')
                supabase.table('gallery_images').update({'image_url': new_url}).eq('id', img['id']).execute()
                updated += 1
        print(f"  Updated {updated} gallery images")

        # Update gallery covers
        print("Updating gallery covers...")
        result = supabase.table('galleries').select('id, cover_image_url, cover_image_square_url').execute()
        updated = 0
        for g in result.data:
            updates = {}

            cover = g.get('cover_image_url', '')
            if '/storage/galleries/galleries/' in cover:
                updates['cover_image_url'] = cover.replace('/storage/galleries/galleries/', '/storage/storage/covers/')

            square = g.get('cover_image_square_url', '')
            if '/storage/galleries/galleries/' in square:
                updates['cover_image_square_url'] = square.replace('/storage/galleries/galleries/', '/storage/storage/covers/')

            if updates:
                supabase.table('galleries').update(updates).eq('id', g['id']).execute()
                updated += 1
        print(f"  Updated {updated} gallery covers")

        # Update avatars
        print("Updating avatars...")
        result = supabase.table('people').select('id, avatar_url').execute()
        updated = 0
        for p in result.data:
            url = p.get('avatar_url', '')
            if '/storage/galleries/avatars/' in url:
                new_url = url.replace('/storage/galleries/avatars/', '/storage/storage/avatars/')
                supabase.table('people').update({'avatar_url': new_url}).eq('id', p['id']).execute()
                updated += 1
        print(f"  Updated {updated} avatars")

    print("\n=== Summary ===")
    print(f"Photos moved: {moved_photos}")
    print(f"Covers moved: {moved_covers}")
    print(f"Avatars moved: {moved_avatars}")

    if dry_run:
        print("\nRun without --dry-run to execute")
    else:
        print("\nDone! Old bucket can be deleted after verification.")
        print(f"New public URL base: {MINIO_PUBLIC_URL.replace('/storage', '/storage')}")


if __name__ == "__main__":
    main()
