"""
Admin Debug - Gallery Operations

Endpoints:
- GET /debug-gallery - Debug gallery processing status
"""

from typing import Optional, Dict, List
from fastapi import APIRouter

from core.responses import ApiResponse
from core.logging import get_logger

from ..helpers import get_supabase_db

logger = get_logger(__name__)
router = APIRouter()


@router.get("/debug-gallery")
async def debug_gallery(id: Optional[str] = None, fix: bool = False):
    """
    Debug gallery processing status and fix inconsistencies.
    
    Migrated from: app/api/admin/debug-gallery/route.ts
    
    - Without id: returns list of galleries with problems
    - With id: detailed diagnosis of specific gallery
    - With fix=true: auto-fix has_been_processed flags
    """
    supabase_db = get_supabase_db()
    
    if not supabase_db:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db.client
        
        if not id:
            # List all galleries with problems
            galleries_result = client.table("galleries").select(
                "id, slug, title, shoot_date, gallery_images(id, slug, has_been_processed)"
            ).order("shoot_date", desc=True).execute()
            galleries = galleries_result.data or []
            
            problem_galleries = []
            
            for gallery in galleries:
                images = gallery.get("gallery_images") or []
                total = len(images)
                processed = len([img for img in images if img.get("has_been_processed")])
                image_ids = [img["id"] for img in images]
                
                # Check how many photos actually have faces
                photos_with_faces = 0
                if image_ids:
                    faces_result = client.table("photo_faces").select("photo_id").in_("photo_id", image_ids).execute()
                    unique_photo_ids = set(f["photo_id"] for f in (faces_result.data or []))
                    photos_with_faces = len(unique_photo_ids)
                
                # Problem if processed != total or processed != photos_with_faces
                if processed != total or processed != photos_with_faces:
                    problem_galleries.append({
                        "id": gallery["id"],
                        "slug": gallery.get("slug"),
                        "title": gallery["title"],
                        "shoot_date": gallery.get("shoot_date"),
                        "total_photos": total,
                        "processed_flag": processed,
                        "photos_with_faces": photos_with_faces,
                        "issues": {
                            "unprocessed": total - processed,
                            "flag_mismatch": processed != photos_with_faces
                        }
                    })
            
            return ApiResponse.ok({
                "total_galleries": len(galleries),
                "problem_galleries": len(problem_galleries),
                "galleries": problem_galleries
            }).model_dump()
        
        # Detailed diagnosis of specific gallery
        gallery_result = client.table("galleries").select("id, slug, title, shoot_date").eq("id", id).single().execute()
        if not gallery_result.data:
            return ApiResponse.fail("Gallery not found", code="NOT_FOUND").model_dump()
        
        gallery = gallery_result.data
        
        # Get all photos
        images_result = client.table("gallery_images").select(
            "id, slug, original_filename, has_been_processed, created_at"
        ).eq("gallery_id", id).order("original_filename").execute()
        images = images_result.data or []
        image_ids = [img["id"] for img in images]
        
        # Get all faces for these photos
        all_faces = []
        if image_ids:
            faces_result = client.table("photo_faces").select(
                "id, photo_id, person_id, recognition_confidence, verified"
            ).in_("photo_id", image_ids).execute()
            all_faces = faces_result.data or []
        
        # Group faces by photo_id
        faces_by_photo: Dict[str, List] = {}
        for face in all_faces:
            photo_id = face["photo_id"]
            if photo_id not in faces_by_photo:
                faces_by_photo[photo_id] = []
            faces_by_photo[photo_id].append(face)
        
        # Analyze each photo
        photo_analysis = []
        for img in images:
            faces = faces_by_photo.get(img["id"], [])
            has_faces = len(faces) > 0
            flag_correct = img["has_been_processed"] == has_faces
            
            issue = None
            if not flag_correct:
                if has_faces and not img["has_been_processed"]:
                    issue = "HAS_FACES_BUT_NOT_PROCESSED"
                elif not has_faces and img["has_been_processed"]:
                    issue = "NO_FACES_BUT_MARKED_PROCESSED"
            
            photo_analysis.append({
                "id": img["id"],
                "slug": img.get("slug"),
                "filename": img["original_filename"],
                "has_been_processed": img["has_been_processed"],
                "faces_count": len(faces),
                "faces_with_person": len([f for f in faces if f.get("person_id")]),
                "faces_unknown": len([f for f in faces if not f.get("person_id")]),
                "faces_verified": len([f for f in faces if f.get("recognition_confidence") == 1]),
                "faces_unverified": len([f for f in faces if f.get("recognition_confidence") is not None and f.get("recognition_confidence") < 1]),
                "faces_conf_null": len([f for f in faces if f.get("recognition_confidence") is None]),
                "flag_correct": flag_correct,
                "issue": issue
            })
        
        problem_photos = [p for p in photo_analysis if not p["flag_correct"]]
        photos_without_faces = [p for p in photo_analysis if p["faces_count"] == 0]
        
        # Fix if requested
        fix_results = None
        if fix and problem_photos:
            fix_results = {"fixed": 0, "errors": []}
            for photo in problem_photos:
                should_be_processed = photo["faces_count"] > 0
                try:
                    client.table("gallery_images").update(
                        {"has_been_processed": should_be_processed}
                    ).eq("id", photo["id"]).execute()
                    fix_results["fixed"] += 1
                except Exception as e:
                    fix_results["errors"].append(f"{photo['filename']}: {str(e)}")
        
        # Statistics
        stats = {
            "total_photos": len(images),
            "processed_by_flag": len([img for img in images if img["has_been_processed"]]),
            "photos_with_faces": len([p for p in photo_analysis if p["faces_count"] > 0]),
            "total_faces": len(all_faces),
            "faces_with_person": len([f for f in all_faces if f.get("person_id")]),
            "faces_unknown": len([f for f in all_faces if not f.get("person_id")]),
            "faces_verified": len([f for f in all_faces if f.get("recognition_confidence") == 1]),
            "faces_conf_null": len([f for f in all_faces if f.get("recognition_confidence") is None])
        }
        
        issues = {
            "total_problems": len(problem_photos),
            "has_faces_but_not_processed": len([p for p in photo_analysis if p["issue"] == "HAS_FACES_BUT_NOT_PROCESSED"]),
            "no_faces_but_marked_processed": len([p for p in photo_analysis if p["issue"] == "NO_FACES_BUT_MARKED_PROCESSED"]),
            "photos_without_any_faces": len(photos_without_faces)
        }
        
        return ApiResponse.ok({
            "gallery": gallery,
            "stats": stats,
            "issues": issues,
            "problem_photos": problem_photos[:20],
            "photos_without_faces": [
                {"id": p["id"], "slug": p.get("slug"), "filename": p["filename"], "has_been_processed": p["has_been_processed"]}
                for p in photos_without_faces[:10]
            ],
            "fix_results": fix_results,
            "hint": "Add ?fix=true to auto-fix has_been_processed flags" if problem_photos else "No issues found"
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in debug-gallery: {e}", exc_info=True)
        return ApiResponse.fail(f"Debug failed: {str(e)}", code="DEBUG_ERROR").model_dump()
