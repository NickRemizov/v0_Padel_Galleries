"""
Admin API - Face Statistics
Comprehensive face recognition statistics endpoint

v1.1: Fixed inconsistent_verified check - use >= 0.99 threshold instead of exact != 1
"""

from typing import Dict
from fastapi import APIRouter

from core.responses import ApiResponse
from core.logging import get_logger

from .helpers import (
    get_supabase_db,
    format_short_date,
    generate_dynamic_thresholds,
    generate_dynamic_histogram_buckets,
    load_all_photo_faces,
    get_confidence_threshold,
    count_faces_for_gallery,
)

logger = get_logger(__name__)
router = APIRouter()

# v1.1: Threshold for "100%" confidence comparison (must match cleanup.ts)
CONFIDENCE_100_THRESHOLD = 0.99


@router.get("/face-statistics")
async def get_face_statistics(top: int = 15):
    """
    Get comprehensive face recognition statistics.
    
    Migrated from: app/api/admin/face-statistics/route.ts
    """
    supabase_db = get_supabase_db()
    
    if not supabase_db:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db.client
        
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
        
        # v1.1: Fixed integrity check - use < 0.99 instead of != 1
        # This matches the threshold used in cleanup.ts syncVerifiedAndConfidenceAction
        inconsistent_result = client.table("photo_faces").select("*", count="exact", head=True).eq("verified", True).lt("recognition_confidence", CONFIDENCE_100_THRESHOLD).execute()
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
