"""
Admin Router - Administrative endpoints for face recognition system

Migrated from frontend direct Supabase access to centralized FastAPI.
"""

from fastapi import APIRouter
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from core.responses import ApiResponse
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)

router = APIRouter()

# ============================================================
# Service Injection
# ============================================================

supabase_db_instance: SupabaseDatabase = None

def set_services(supabase_db: SupabaseDatabase):
    global supabase_db_instance
    supabase_db_instance = supabase_db
    logger.info("Admin router services initialized")


# ============================================================
# Helper Functions
# ============================================================

def format_short_date(date_str: Optional[str]) -> str:
    """Format date as DD.MM"""
    if not date_str:
        return ""
    try:
        from datetime import datetime
        date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return f"{date.day:02d}.{date.month:02d}"
    except:
        return ""


def generate_dynamic_thresholds(max_photos: int) -> List[int]:
    """Generate threshold values for distribution analysis"""
    thresholds = [1, 3, 5, 10]
    threshold = 15
    while threshold <= max_photos:
        thresholds.append(threshold)
        threshold += 5
    return thresholds


def generate_dynamic_histogram_buckets(max_photos: int) -> List[Dict[str, Any]]:
    """Generate histogram bucket definitions"""
    buckets = [
        {"range": "1-2", "min": 1, "max": 2},
        {"range": "3-4", "min": 3, "max": 4},
        {"range": "5-9", "min": 5, "max": 9},
        {"range": "10-14", "min": 10, "max": 14},
    ]
    
    start = 15
    while start <= max_photos:
        end = start + 4
        if end >= max_photos and start <= max_photos:
            buckets.append({"range": f"{start}+", "min": start, "max": 9999})
            break
        else:
            buckets.append({"range": f"{start}-{end}", "min": start, "max": end})
        start += 5
    
    return buckets


async def load_all_photo_faces(client, select_fields: str, filters: Optional[Dict] = None) -> List[Dict]:
    """Load all photo_faces records with pagination (Supabase limit is 1000)"""
    all_records = []
    offset = 0
    page_size = 1000
    
    while True:
        query = client.table("photo_faces").select(select_fields).range(offset, offset + page_size - 1)
        
        if filters:
            for key, value in filters.items():
                if value is None:
                    query = query.is_(key, "null")
                elif isinstance(value, dict):
                    if "neq" in value:
                        neq_value = value["neq"]
                        if neq_value is None:
                            # For "not null" comparisons, use not_.is_() instead of neq()
                            query = query.not_.is_(key, "null")
                        else:
                            query = query.neq(key, neq_value)
                    elif "eq" in value:
                        query = query.eq(key, value["eq"])
                else:
                    query = query.eq(key, value)
        
        result = query.execute()
        batch = result.data if result.data else []
        
        if not batch:
            break
        all_records.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    
    return all_records


async def get_confidence_threshold(client) -> float:
    """Get confidence threshold from settings"""
    try:
        result = client.table("face_recognition_config").select("value").eq("key", "recognition_settings").single().execute()
        if result.data and result.data.get("value", {}).get("confidence_thresholds", {}).get("high_data"):
            return result.data["value"]["confidence_thresholds"]["high_data"]
    except Exception as e:
        logger.warning(f"Failed to get confidence threshold: {e}")
    return 0.6  # fallback


def count_faces_for_gallery(image_ids: List[str], all_photo_faces: List[Dict]) -> Dict[str, int]:
    """Count faces by category for a gallery"""
    gallery_faces = [f for f in all_photo_faces if f.get("photo_id") in image_ids]
    verified = len([f for f in gallery_faces if f.get("person_id") and f.get("recognition_confidence") == 1])
    unverified = len([f for f in gallery_faces if f.get("person_id") and f.get("recognition_confidence") is not None and f.get("recognition_confidence") < 1])
    unknown = len([f for f in gallery_faces if f.get("person_id") is None])
    return {"verified": verified, "unverified": unverified, "unknown": unknown}


# ============================================================
# Face Statistics Endpoint
# ============================================================

@router.get("/face-statistics")
async def get_face_statistics(top: int = 15):
    """
    Get comprehensive face recognition statistics.
    
    Migrated from: app/api/admin/face-statistics/route.ts
    """
    if not supabase_db_instance:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db_instance.client
        
        # Get confidence threshold from settings
        confidence_threshold = await get_confidence_threshold(client)
        logger.debug(f"Using confidence threshold: {confidence_threshold}")
        
        # Basic counts
        total_people = client.table("people").select("*", count="exact", head=True).execute()
        total_photo_faces = client.table("photo_faces").select("*", count="exact", head=True).execute()
        verified_faces = client.table("photo_faces").select("*", count="exact", head=True).eq("verified", True).execute()
        unknown_faces = client.table("photo_faces").select("*", count="exact", head=True).is_("person_id", "null").execute()
        total_images = client.table("gallery_images").select("*", count="exact", head=True).execute()
        processed_images = client.table("gallery_images").select("*", count="exact", head=True).eq("has_been_processed", True).execute()
        
        total_people_count = total_people.count or 0
        total_photo_faces_count = total_photo_faces.count or 0
        verified_faces_count = verified_faces.count or 0
        unknown_faces_count = unknown_faces.count or 0
        total_images_count = total_images.count or 0
        processed_images_count = processed_images.count or 0
        
        # Load all verified faces for unique people count
        people_with_verified = await load_all_photo_faces(
            client, 
            "person_id",
            {"verified": True, "person_id": {"neq": None}}
        )
        unique_people_with_verified = set(f["person_id"] for f in people_with_verified if f.get("person_id"))
        people_with_verified_count = len(unique_people_with_verified)
        people_without_verified_count = total_people_count - people_with_verified_count
        
        # Get all people for name lookups
        all_people_result = client.table("people").select("id, real_name, telegram_name").order("real_name").execute()
        all_people = all_people_result.data or []
        
        # People without verified faces list
        people_without_verified_list = [
            {"id": p["id"], "name": p.get("real_name") or p.get("telegram_name") or "Без имени"}
            for p in all_people if p["id"] not in unique_people_with_verified
        ][:50]
        
        # Load all photo_faces for analysis
        all_photo_faces = await load_all_photo_faces(
            client,
            "photo_id, person_id, recognition_confidence, verified"
        )
        
        # Photos with faces count
        photo_face_counts: Dict[str, int] = {}
        for face in all_photo_faces:
            photo_id = face.get("photo_id")
            if photo_id:
                photo_face_counts[photo_id] = photo_face_counts.get(photo_id, 0) + 1
        
        with_1_person = sum(1 for c in photo_face_counts.values() if c == 1)
        with_2_3_persons = sum(1 for c in photo_face_counts.values() if 2 <= c <= 3)
        with_4_plus_persons = sum(1 for c in photo_face_counts.values() if c >= 4)
        
        # Visible faces per person (confidence >= threshold)
        visible_faces = [
            f for f in all_photo_faces 
            if f.get("person_id") and f.get("recognition_confidence") is not None 
            and f.get("recognition_confidence") >= confidence_threshold
        ]
        
        person_face_counts: Dict[str, int] = {}
        for face in visible_faces:
            person_id = face.get("person_id")
            if person_id:
                person_face_counts[person_id] = person_face_counts.get(person_id, 0) + 1
        
        face_counts = list(person_face_counts.values())
        max_photos_per_player = max(face_counts) if face_counts else 0
        player_stats_avg = round(sum(face_counts) / len(face_counts), 1) if face_counts else 0
        player_stats_min = min(face_counts) if face_counts else 0
        player_stats_max = max_photos_per_player
        
        # Gallery statistics
        galleries_result = client.table("galleries").select("id, title, shoot_date, slug, gallery_images(id, slug, has_been_processed)").execute()
        galleries = galleries_result.data or []
        
        # Track photos with unknown/unverified faces
        photo_has_unknown_faces: Dict[str, bool] = {}
        photo_has_unverified_faces: Dict[str, bool] = {}
        
        for face in all_photo_faces:
            photo_id = face.get("photo_id")
            if not photo_id:
                continue
            if face.get("person_id") is None:
                photo_has_unknown_faces[photo_id] = True
            if face.get("recognition_confidence") is not None and face.get("recognition_confidence") < 1:
                photo_has_unverified_faces[photo_id] = True
        
        gallery_photo_counts = [len(g.get("gallery_images") or []) for g in galleries]
        gallery_stats_avg = round(sum(gallery_photo_counts) / len(gallery_photo_counts)) if gallery_photo_counts else 0
        gallery_stats_min = min([c for c in gallery_photo_counts if c > 0]) if any(c > 0 for c in gallery_photo_counts) else 0
        gallery_stats_max = max(gallery_photo_counts) if gallery_photo_counts else 0
        
        # Few photos list
        few_photos_list = []
        for person_id, count in person_face_counts.items():
            if 1 <= count <= 2:
                person = next((p for p in all_people if p["id"] == person_id), None)
                if person:
                    few_photos_list.append({
                        "id": person_id,
                        "name": person.get("real_name") or person.get("telegram_name") or "Без имени",
                        "count": count
                    })
        few_photos_list.sort(key=lambda x: x["count"])
        
        # No avatar list
        no_avatar_result = client.table("people").select("id, real_name, telegram_name").is_("avatar_url", "null").limit(50).execute()
        no_avatar_list = [
            {"id": p["id"], "name": p.get("real_name") or p.get("telegram_name") or "Без имени"}
            for p in (no_avatar_result.data or [])
        ]
        
        # Top players
        top_players = []
        for person_id, count in sorted(person_face_counts.items(), key=lambda x: -x[1])[:top]:
            person = next((p for p in all_people if p["id"] == person_id), None)
            if person:
                top_players.append({
                    "id": person_id,
                    "name": person.get("real_name") or person.get("telegram_name") or "Без имени",
                    "count": count
                })
        
        # Gallery categorization
        fully_verified_list = []
        fully_recognized_list = []
        fully_processed_list = []
        partially_verified_list = []
        not_processed_list = []
        
        for gallery in galleries:
            images = gallery.get("gallery_images") or []
            total = len(images)
            processed = len([img for img in images if img.get("has_been_processed")])
            date = format_short_date(gallery.get("shoot_date"))
            
            image_ids = [img["id"] for img in images]
            has_unknown = any(photo_has_unknown_faces.get(id) for id in image_ids)
            has_unverified = any(photo_has_unverified_faces.get(id) for id in image_ids)
            
            gallery_info = {
                "id": gallery["id"],
                "slug": gallery.get("slug"),
                "title": gallery["title"],
                "date": date
            }
            
            if total == 0 or processed == 0:
                not_processed_list.append({**gallery_info, "photos": total})
            elif processed == total:
                faces = count_faces_for_gallery(image_ids, all_photo_faces)
                if has_unknown:
                    fully_processed_list.append({
                        **gallery_info, 
                        "photos": total,
                        "facesVerified": faces["verified"],
                        "facesUnverified": faces["unverified"],
                        "facesUnknown": faces["unknown"]
                    })
                elif has_unverified:
                    fully_recognized_list.append({
                        **gallery_info,
                        "photos": total,
                        "facesVerified": faces["verified"],
                        "facesUnverified": faces["unverified"]
                    })
                else:
                    fully_verified_list.append({
                        **gallery_info,
                        "photos": total,
                        "facesVerified": faces["verified"]
                    })
            else:
                faces = count_faces_for_gallery(image_ids, all_photo_faces)
                partially_verified_list.append({
                    **gallery_info,
                    "processed": processed,
                    "total": total,
                    "facesVerified": faces["verified"],
                    "facesUnverified": faces["unverified"],
                    "facesUnknown": faces["unknown"]
                })
        
        # Integrity checks
        inconsistent_result = client.table("photo_faces").select("*", count="exact", head=True).eq("verified", True).neq("recognition_confidence", 1).execute()
        inconsistent_count = inconsistent_result.count or 0
        
        # Orphaned descriptors (try RPC)
        orphaned_descriptors_count = 0
        try:
            orphaned_result = client.rpc("count_orphaned_descriptors").execute()
            orphaned_descriptors_count = orphaned_result.data or 0
        except:
            pass
        
        # Average unverified confidence (sample)
        unverified_conf_result = client.table("photo_faces").select("recognition_confidence").eq("verified", False).not_.is_("person_id", "null").not_.is_("recognition_confidence", "null").limit(1000).execute()
        avg_unverified_confidence = 0
        if unverified_conf_result.data:
            confs = [f["recognition_confidence"] for f in unverified_conf_result.data if f.get("recognition_confidence") is not None]
            if confs:
                avg_unverified_confidence = sum(confs) / len(confs)
        
        # Distribution
        thresholds = generate_dynamic_thresholds(max_photos_per_player)
        distribution = []
        for threshold in thresholds:
            count = len([c for c in face_counts if c >= threshold])
            percentage = round((count / len(face_counts)) * 100) if face_counts else 0
            distribution.append({"threshold": threshold, "count": count, "percentage": percentage})
        
        # Histogram
        histogram_buckets = generate_dynamic_histogram_buckets(max_photos_per_player)
        histogram = []
        for bucket in histogram_buckets:
            people_in_bucket = [c for c in face_counts if bucket["min"] <= c <= bucket["max"]]
            histogram.append({
                "range": bucket["range"],
                "count": len(people_in_bucket),
                "total_faces": sum(people_in_bucket)
            })
        
        return ApiResponse.ok({
            "confidence_threshold": confidence_threshold,
            "players": {
                "total": total_people_count,
                "with_verified": people_with_verified_count,
                "without_verified": people_without_verified_count,
                "without_verified_list": people_without_verified_list
            },
            "faces": {
                "total": total_photo_faces_count,
                "verified": verified_faces_count,
                "unverified": total_photo_faces_count - verified_faces_count
            },
            "images": {
                "total": total_images_count,
                "recognized": processed_images_count,
                "with_1_person": with_1_person,
                "with_2_3_persons": with_2_3_persons,
                "with_4_plus_persons": with_4_plus_persons
            },
            "player_stats": {
                "avg_photos": player_stats_avg,
                "min_photos": player_stats_min,
                "max_photos": player_stats_max
            },
            "gallery_stats": {
                "avg_photos": gallery_stats_avg,
                "min_photos": gallery_stats_min,
                "max_photos": gallery_stats_max
            },
            "attention": {
                "few_photos_count": len(few_photos_list),
                "few_photos_list": few_photos_list,
                "no_avatar_count": len(no_avatar_list),
                "no_avatar_list": no_avatar_list,
                "unknown_faces": unknown_faces_count
            },
            "top_players": top_players,
            "galleries": {
                "total": len(galleries),
                "fully_verified": len(fully_verified_list),
                "fully_verified_list": fully_verified_list,
                "fully_recognized": len(fully_recognized_list),
                "fully_recognized_list": fully_recognized_list,
                "fully_processed": len(fully_processed_list),
                "fully_processed_list": fully_processed_list,
                "partially_verified": len(partially_verified_list),
                "partially_verified_list": partially_verified_list,
                "not_processed": len(not_processed_list),
                "not_processed_list": not_processed_list
            },
            "integrity": {
                "inconsistent_verified": inconsistent_count,
                "orphaned_descriptors": orphaned_descriptors_count,
                "avg_unverified_confidence": avg_unverified_confidence
            },
            "distribution": distribution,
            "histogram": histogram
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error fetching face statistics: {e}", exc_info=True)
        return ApiResponse.fail(f"Failed to fetch statistics: {str(e)}", code="STATISTICS_ERROR").model_dump()


# ============================================================
# Debug Gallery Endpoint
# ============================================================

@router.get("/debug-gallery")
async def debug_gallery(id: Optional[str] = None, fix: bool = False):
    """
    Debug gallery processing status and fix inconsistencies.
    
    Migrated from: app/api/admin/debug-gallery/route.ts
    
    - Without id: returns list of galleries with problems
    - With id: detailed diagnosis of specific gallery
    - With fix=true: auto-fix has_been_processed flags
    """
    if not supabase_db_instance:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db_instance.client
        
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


# ============================================================
# Check Gallery Endpoint  
# ============================================================

@router.get("/check-gallery")
async def check_gallery(id: Optional[str] = None, search: Optional[str] = None, all: bool = False):
    """
    Check gallery status and search galleries.
    
    Migrated from: app/api/admin/check-gallery/route.ts
    
    - all=true: list all galleries with photo counts
    - id=xxx: check specific gallery stats
    - search=xxx: search galleries by title
    """
    if not supabase_db_instance:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db_instance.client
        
        if all:
            galleries_result = client.table("galleries").select(
                "id, slug, title, shoot_date, created_at"
            ).order("shoot_date", desc=True).limit(50).execute()
            galleries = galleries_result.data or []
            
            galleries_with_counts = []
            for g in galleries:
                count_result = client.table("gallery_images").select("*", count="exact", head=True).eq("gallery_id", g["id"]).execute()
                galleries_with_counts.append({
                    **g,
                    "photo_count": count_result.count or 0
                })
            
            return ApiResponse.ok({
                "galleries": galleries_with_counts,
                "total": len(galleries_with_counts)
            }).model_dump()
        
        if id:
            gallery_result = client.table("galleries").select("id, slug, title, shoot_date").eq("id", id).single().execute()
            if not gallery_result.data:
                return ApiResponse.fail("Gallery not found", code="NOT_FOUND").model_dump()
            
            gallery = gallery_result.data
            
            images_result = client.table("gallery_images").select("id, has_been_processed").eq("gallery_id", id).execute()
            images = images_result.data or []
            image_ids = [img["id"] for img in images]
            
            faces = []
            if image_ids:
                faces_result = client.table("photo_faces").select(
                    "photo_id, person_id, recognition_confidence, verified"
                ).in_("photo_id", image_ids).execute()
                faces = faces_result.data or []
            
            stats = {
                "total_photos": len(images),
                "processed_photos": len([img for img in images if img["has_been_processed"]]),
                "total_faces": len(faces),
                "faces_with_person": len([f for f in faces if f.get("person_id")]),
                "faces_conf_1": len([f for f in faces if f.get("recognition_confidence") == 1]),
                "faces_conf_null": len([f for f in faces if f.get("recognition_confidence") is None]),
                "faces_conf_null_with_person": len([f for f in faces if f.get("recognition_confidence") is None and f.get("person_id")])
            }
            
            return ApiResponse.ok({"gallery": gallery, "stats": stats}).model_dump()
        
        # Search galleries
        search_term = search or "дружеск"
        galleries_result = client.table("galleries").select(
            "id, slug, title, shoot_date, created_at"
        ).or_(f"title.ilike.%{search_term}%,title.ilike.%Дружеск%,title.ilike.%дружеск%").order("shoot_date", desc=True).limit(20).execute()
        galleries = galleries_result.data or []
        
        galleries_with_counts = []
        for g in galleries:
            count_result = client.table("gallery_images").select("*", count="exact", head=True).eq("gallery_id", g["id"]).execute()
            galleries_with_counts.append({
                **g,
                "photo_count": count_result.count or 0
            })
        
        return ApiResponse.ok({
            "galleries": galleries_with_counts,
            "searchTerm": search_term,
            "found": len(galleries_with_counts)
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in check-gallery: {e}", exc_info=True)
        return ApiResponse.fail(f"Check failed: {str(e)}", code="CHECK_ERROR").model_dump()
