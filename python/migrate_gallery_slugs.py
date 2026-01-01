#!/usr/bin/env python3
"""
Migration script: Update gallery slugs to include date.

Format: title_DD-MM-YY (e.g., Bullpadel_League_08-11-25)

Run: python migrate_gallery_slugs.py
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from infrastructure.supabase import SupabaseClient
from core.slug import generate_gallery_slug, make_unique_slug


def migrate_gallery_slugs():
    """Update all gallery slugs to new format with date."""
    db = SupabaseClient()

    # Get all galleries
    result = db.client.table("galleries").select("id, title, shoot_date, slug").execute()
    galleries = result.data or []

    print(f"Found {len(galleries)} galleries to migrate")

    # Track existing slugs for uniqueness
    existing_slugs = set()
    updates = []

    for gallery in galleries:
        gallery_id = gallery["id"]
        title = gallery.get("title") or ""
        shoot_date = gallery.get("shoot_date")
        old_slug = gallery.get("slug")

        # Generate new slug with date
        base_slug = generate_gallery_slug(title, shoot_date)
        if not base_slug:
            base_slug = "gallery"

        new_slug = make_unique_slug(base_slug, existing_slugs)
        existing_slugs.add(new_slug)

        if new_slug != old_slug:
            updates.append({
                "id": gallery_id,
                "old_slug": old_slug,
                "new_slug": new_slug,
                "title": title,
                "shoot_date": shoot_date
            })

    print(f"\nSlug changes needed: {len(updates)}")

    if not updates:
        print("No changes needed!")
        return

    # Show preview
    print("\nPreview of changes:")
    for u in updates[:10]:
        print(f"  {u['old_slug']} -> {u['new_slug']}")
    if len(updates) > 10:
        print(f"  ... and {len(updates) - 10} more")

    # Confirm
    confirm = input("\nApply changes? [y/N]: ")
    if confirm.lower() != 'y':
        print("Aborted")
        return

    # Apply updates
    success = 0
    errors = 0

    for u in updates:
        try:
            db.client.table("galleries").update({"slug": u["new_slug"]}).eq("id", u["id"]).execute()
            success += 1
            print(f"  Updated: {u['old_slug']} -> {u['new_slug']}")
        except Exception as e:
            errors += 1
            print(f"  Error updating {u['id']}: {e}")

    print(f"\nDone! Success: {success}, Errors: {errors}")


if __name__ == "__main__":
    migrate_gallery_slugs()
