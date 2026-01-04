"""
Galleries CRUD Operations

Endpoints:
- GET /           - List all galleries
- GET /{id}       - Get gallery by ID or slug
- POST /          - Create gallery
- PUT /{id}       - Update gallery
- DELETE /{id}    - Delete gallery
- PATCH /{id}/sort-order - Update sort order
"""

from fastapi import APIRouter, Query

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from core.slug import generate_gallery_slug, generate_photo_slug, make_unique_slug

from .models import GalleryCreate, GalleryUpdate
from .helpers import get_supabase_db, get_face_service, _resolve_gallery, _get_gallery_id

logger = get_logger(__name__)
router = APIRouter()


def _generate_unique_gallery_slug(title: str, shoot_date: str = None, exclude_id: str = None) -> str:
    """Generate unique slug for a gallery.

    Format: title_DD-MM-YY (e.g. Bullpadel_League_08-11-25)
    Index suffix added only if title+date combination already exists.
    """
    supabase_db = get_supabase_db()

    result = supabase_db.client.table("galleries").select("id, slug").execute()
    existing_slugs = {
        g["slug"] for g in (result.data or [])
        if g.get("slug") and g["id"] != exclude_id
    }

    base_slug = generate_gallery_slug(title or "", shoot_date)
    if not base_slug:
        base_slug = "gallery"

    return make_unique_slug(base_slug, existing_slugs)


@router.get("/")
async def get_galleries(
    sort_by: str = Query("shoot_date", enum=["created_at", "shoot_date"]),
    with_relations: bool = Query(True)
):
    """Get all galleries for listing.
    
    Returns galleries with photo_count field.
    """
    supabase_db = get_supabase_db()
    
    try:
        select = "*"
        if with_relations:
            select = "*, photographers(id, name), locations(id, name), organizers(id, name), gallery_images(id)"
        
        result = supabase_db.client.table("galleries").select(select).order(sort_by, desc=True).execute()
        galleries = result.data or []
        
        for gallery in galleries:
            images = gallery.pop("gallery_images", None)
            gallery["photo_count"] = len(images) if images else 0
        
        return ApiResponse.ok(galleries)
    except Exception as e:
        logger.error(f"Error getting galleries: {e}")
        raise DatabaseError(str(e), operation="get_galleries")


@router.get("/{identifier}")
async def get_gallery(identifier: str, full: bool = Query(False)):
    """Get a gallery by ID or slug.
    
    Args:
        identifier: Gallery ID or slug
        full: If True, include gallery_images with people (for public gallery page)
    """
    supabase_db = get_supabase_db()
    
    try:
        gallery = _resolve_gallery(
            identifier,
            select="*, photographers(id, name), locations(id, name), organizers(id, name)"
        )
        
        if not gallery:
            raise NotFoundError("Gallery", identifier)
        
        gallery_id = gallery["id"]
        
        if full:
            # Full mode: include images with people for public gallery page
            images_result = supabase_db.client.table("gallery_images").select(
                "id, gallery_id, image_url, original_url, original_filename, file_size, width, height, display_order, download_count, created_at, slug"
            ).eq("gallery_id", gallery_id).order("original_filename").execute()
            
            images = images_result.data or []
            
            if images:
                image_ids = [img["id"] for img in images]

                # Get faces with person info, filter by show_photos_in_galleries and hidden_by_user
                faces_result = supabase_db.client.table("photo_faces").select(
                    "photo_id, person_id, hidden_by_user, people(id, real_name, show_photos_in_galleries)"
                ).in_("photo_id", image_ids).not_.is_("person_id", "null").eq("hidden_by_user", False).execute()
                
                faces = faces_result.data or []
                
                # Group people by photo, respecting show_photos_in_galleries
                people_by_photo = {}
                for face in faces:
                    photo_id = face["photo_id"]
                    person = face.get("people")
                    if person and person.get("show_photos_in_galleries", True):
                        if photo_id not in people_by_photo:
                            people_by_photo[photo_id] = []
                        # Avoid duplicates
                        person_ids = [p["id"] for p in people_by_photo[photo_id]]
                        if person["id"] not in person_ids:
                            people_by_photo[photo_id].append({
                                "id": person["id"],
                                "name": person["real_name"]
                            })
                
                # Add people to each image
                for img in images:
                    img["people"] = people_by_photo.get(img["id"], [])
            
            gallery["gallery_images"] = images
            gallery["photo_count"] = len(images)
        else:
            # Simple mode: just count
            count_result = supabase_db.client.table("gallery_images").select(
                "id", count="exact"
            ).eq("gallery_id", gallery_id).execute()
            gallery["photo_count"] = count_result.count or 0
        
        return ApiResponse.ok(gallery)
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="get_gallery")


@router.post("/")
async def create_gallery(data: GalleryCreate):
    """Create a new gallery."""
    supabase_db = get_supabase_db()

    try:
        insert_data = data.model_dump(exclude_none=True)

        # Auto-generate slug with date
        insert_data["slug"] = _generate_unique_gallery_slug(data.title or "", data.shoot_date)

        result = supabase_db.client.table("galleries").insert(insert_data).execute()
        if result.data:
            logger.info(f"Created gallery: {data.title} (slug: {insert_data['slug']})")
            return ApiResponse.ok(result.data[0])
        raise DatabaseError("Insert failed", operation="create_gallery")
    except Exception as e:
        logger.error(f"Error creating gallery: {e}")
        raise DatabaseError(str(e), operation="create_gallery")


@router.put("/{identifier}")
async def update_gallery(identifier: str, data: GalleryUpdate):
    """Update a gallery by ID or slug."""
    supabase_db = get_supabase_db()

    try:
        gallery_id = _get_gallery_id(identifier)

        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")

        # Regenerate slug if title or shoot_date changed
        if "title" in update_data or "shoot_date" in update_data:
            # Get current gallery data for fields not being updated
            current = supabase_db.client.table("galleries").select("title, shoot_date").eq("id", gallery_id).execute()
            current_data = current.data[0] if current.data else {}

            new_title = update_data.get("title", current_data.get("title", ""))
            new_date = update_data.get("shoot_date", current_data.get("shoot_date"))

            update_data["slug"] = _generate_unique_gallery_slug(
                new_title,
                new_date,
                exclude_id=gallery_id
            )
            logger.info(f"Regenerated slug for gallery {gallery_id}: {update_data['slug']}")

        result = supabase_db.client.table("galleries").update(update_data).eq("id", gallery_id).execute()
        if result.data:
            logger.info(f"Updated gallery {gallery_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Gallery", identifier)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="update_gallery")


@router.patch("/{identifier}/sort-order")
async def update_sort_order(identifier: str, sort_order: str = Query(...)):
    """Update gallery sort order."""
    supabase_db = get_supabase_db()
    
    try:
        gallery_id = _get_gallery_id(identifier)
        
        supabase_db.client.table("galleries").update({"sort_order": sort_order}).eq("id", gallery_id).execute()
        logger.info(f"Updated sort order for gallery {gallery_id}")
        return ApiResponse.ok({"updated": True})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating sort order: {e}")
        raise DatabaseError(str(e), operation="update_sort_order")


@router.delete("/{identifier}")
async def delete_gallery(identifier: str, delete_images: bool = Query(True)):
    """Delete a gallery and optionally all its images."""
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    try:
        gallery_id = _get_gallery_id(identifier)
        face_ids_in_index = []

        if delete_images:
            images = supabase_db.client.table("gallery_images").select("id").eq("gallery_id", gallery_id).execute()
            image_ids = [img["id"] for img in (images.data or [])]

            if image_ids:
                # Get face_ids with descriptors and person_id before deletion
                faces_result = supabase_db.client.table("photo_faces").select(
                    "id, insightface_descriptor, person_id"
                ).in_("photo_id", image_ids).execute()

                face_ids_in_index = [
                    f["id"] for f in (faces_result.data or [])
                    if f.get("insightface_descriptor") and f.get("person_id")
                ]

                supabase_db.client.table("photo_faces").delete().in_("photo_id", image_ids).execute()
                supabase_db.client.table("gallery_images").delete().eq("gallery_id", gallery_id).execute()
                logger.info(f"Deleted {len(image_ids)} images from gallery {gallery_id}")

        supabase_db.client.table("galleries").delete().eq("id", gallery_id).execute()
        logger.info(f"Deleted gallery {gallery_id}")

        index_rebuilt = False
        if face_ids_in_index and face_service:
            try:
                result = await face_service.remove_faces_from_index(face_ids_in_index)
                index_rebuilt = result.get("deleted", 0) > 0
                logger.info(f"Removed {result.get('deleted', 0)} faces from index")
            except Exception as e:
                logger.error(f"Failed to update index: {e}")
        
        return ApiResponse.ok({"deleted": True, "index_rebuilt": index_rebuilt})
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting gallery {identifier}: {e}")
        raise DatabaseError(str(e), operation="delete_gallery")


@router.post("/{identifier}/rename-files")
async def rename_gallery_files(identifier: str):
    """Rename all files in gallery to standardized format.

    Format: "{gallery_title} {DD.MM}-{XXX}.{ext}"
    Example: "IVIN Padel Tournament 26.11-001.jpg"

    Files are numbered according to gallery sort_order.
    """
    supabase_db = get_supabase_db()

    try:
        # Get gallery info
        gallery = _resolve_gallery(identifier, select="id, title, shoot_date, sort_order")
        if not gallery:
            raise NotFoundError("Gallery", identifier)

        gallery_id = gallery["id"]
        title = gallery["title"]
        shoot_date = gallery.get("shoot_date", "")
        sort_order = gallery.get("sort_order", "filename")

        # Format date as DD.MM
        date_str = ""
        if shoot_date:
            from datetime import datetime
            try:
                dt = datetime.fromisoformat(shoot_date.replace("Z", "+00:00"))
                date_str = dt.strftime("%d.%m")
            except:
                date_str = shoot_date[:5].replace("-", ".") if len(shoot_date) >= 5 else ""

        # Determine sort field
        sort_field = "original_filename"
        if sort_order == "created":
            sort_field = "created_at"
        elif sort_order == "added":
            sort_field = "created_at"  # Same as created for now

        # Get all images in sort order
        result = supabase_db.client.table("gallery_images").select(
            "id, original_filename"
        ).eq("gallery_id", gallery_id).order(sort_field).execute()

        images = result.data or []
        if not images:
            return ApiResponse.ok({
                "renamed": 0,
                "message": "No images to rename"
            })

        # Build base name: "Title DD.MM"
        base_name = f"{title} {date_str}" if date_str else title

        # Get all existing slugs in gallery for uniqueness check
        slugs_result = supabase_db.client.table("gallery_images").select(
            "id, slug"
        ).eq("gallery_id", gallery_id).execute()

        # Rename each image
        renamed_count = 0
        for idx, image in enumerate(images, start=1):
            old_filename = image.get("original_filename", "")

            # Get extension from original filename
            ext = ""
            if "." in old_filename:
                ext = "." + old_filename.rsplit(".", 1)[-1].lower()

            # Generate new filename: "Title DD.MM-001.jpg"
            new_filename = f"{base_name}-{idx:03d}{ext}"

            # Generate new slug
            new_slug = generate_photo_slug(f"{base_name}-{idx:03d}")

            # Update image
            supabase_db.client.table("gallery_images").update({
                "original_filename": new_filename,
                "slug": new_slug
            }).eq("id", image["id"]).execute()

            renamed_count += 1

        logger.info(f"Renamed {renamed_count} files in gallery {gallery_id}")
        return ApiResponse.ok({
            "renamed": renamed_count,
            "format": f"{base_name}-XXX",
            "message": f"Renamed {renamed_count} files"
        })

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error renaming gallery files {identifier}: {e}")
        raise DatabaseError(str(e), operation="rename_gallery_files")
