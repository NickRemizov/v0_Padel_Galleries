"""
People API - Consistency Operations
Endpoints for analyzing embedding consistency: consistency-audit, embedding-consistency
"""

import numpy as np
import json

from fastapi import APIRouter, Query, Depends

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)
router = APIRouter()


def get_supabase_db() -> SupabaseDatabase:
    from . import supabase_db_instance
    return supabase_db_instance


def get_person_id(identifier: str) -> str:
    from . import _get_person_id
    return _get_person_id(identifier)


def convert_bbox_to_array(bbox):
    from . import _convert_bbox_to_array
    return _convert_bbox_to_array(bbox)


# ============ STATIC ROUTES (must be before /{identifier}) ============

@router.get("/consistency-audit")
async def consistency_audit(
    outlier_threshold: float = Query(0.5, description="Similarity below this = outlier"),
    min_descriptors: int = Query(2, description="Skip people with fewer descriptors"),
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """
    Audit embedding consistency for ALL people.
    
    Returns list of people with their consistency metrics, sorted by outlier count (worst first).
    Use this to find players with problematic embeddings.
    
    Now includes excluded_count for each person.
    """
    try:
        logger.info(f"[consistency-audit] Starting audit, threshold={outlier_threshold}, min_descriptors={min_descriptors}")
        
        # Get all people
        people_result = supabase_db.client.table("people").select(
            "id, real_name, telegram_name"
        ).order("real_name").execute()
        
        people = people_result.data or []
        logger.info(f"[consistency-audit] Found {len(people)} people")
        
        # Get confidence threshold for photo counting
        config = supabase_db.get_recognition_config()
        confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.6)
        
        # Load ALL photo_faces with embeddings (paginated)
        all_faces = []
        offset = 0
        page_size = 1000
        while True:
            faces_result = supabase_db.client.table("photo_faces").select(
                "id, person_id, photo_id, verified, recognition_confidence, insightface_descriptor, excluded_from_index"
            ).not_.is_("person_id", "null").not_.is_("insightface_descriptor", "null").range(
                offset, offset + page_size - 1
            ).execute()
            
            batch = faces_result.data or []
            all_faces.extend(batch)
            
            if len(batch) < page_size:
                break
            offset += page_size
        
        logger.info(f"[consistency-audit] Loaded {len(all_faces)} faces with embeddings")
        
        # Group faces by person
        faces_by_person = {}
        for face in all_faces:
            pid = face.get("person_id")
            if pid:
                if pid not in faces_by_person:
                    faces_by_person[pid] = []
                faces_by_person[pid].append(face)
        
        # Process each person
        results = []
        processed = 0
        
        for person in people:
            person_id = person["id"]
            person_name = person.get("real_name") or person.get("telegram_name") or "Unknown"
            person_faces = faces_by_person.get(person_id, [])
            
            # Count photos (verified OR high confidence)
            photo_ids = set()
            for f in person_faces:
                if f.get("verified") or (f.get("recognition_confidence") or 0) >= confidence_threshold:
                    photo_ids.add(f.get("photo_id"))
            photo_count = len(photo_ids)
            
            descriptor_count = len(person_faces)
            
            # Count already excluded
            excluded_count = sum(1 for f in person_faces if f.get("excluded_from_index"))
            
            # Skip if too few descriptors
            if descriptor_count < min_descriptors:
                continue
            
            # Parse embeddings (only non-excluded for centroid calculation)
            embeddings = []
            all_embeddings_with_faces = []
            for face in person_faces:
                descriptor = face.get("insightface_descriptor")
                try:
                    if isinstance(descriptor, list):
                        emb = np.array(descriptor, dtype=np.float32)
                    elif isinstance(descriptor, str):
                        emb = np.array(json.loads(descriptor), dtype=np.float32)
                    else:
                        continue
                    
                    if len(emb) == 512:
                        all_embeddings_with_faces.append((emb, face))
                        # Only use non-excluded for centroid
                        if not face.get("excluded_from_index"):
                            embeddings.append(emb)
                except Exception:
                    continue
            
            if len(embeddings) < 2:
                # If all are excluded or too few, still report
                results.append({
                    "person_id": person_id,
                    "person_name": person_name,
                    "photo_count": photo_count,
                    "descriptor_count": descriptor_count,
                    "excluded_count": excluded_count,
                    "outlier_count": 0,
                    "overall_consistency": 1.0,
                    "has_problems": excluded_count > 0
                })
                continue
            
            # Calculate centroid from non-excluded embeddings
            embeddings_array = np.array(embeddings)
            centroid = np.mean(embeddings_array, axis=0)
            centroid = centroid / np.linalg.norm(centroid)
            
            # Calculate similarities for ALL embeddings (to find new outliers)
            outlier_count = 0
            similarities = []
            for emb, face in all_embeddings_with_faces:
                if face.get("excluded_from_index"):
                    continue  # Skip already excluded from outlier count
                emb_norm = emb / np.linalg.norm(emb)
                sim = float(np.dot(emb_norm, centroid))
                similarities.append(sim)
                if sim < outlier_threshold:
                    outlier_count += 1
            
            overall_consistency = float(np.mean(similarities)) if similarities else 1.0
            
            results.append({
                "person_id": person_id,
                "person_name": person_name,
                "photo_count": photo_count,
                "descriptor_count": descriptor_count,
                "excluded_count": excluded_count,
                "outlier_count": outlier_count,
                "overall_consistency": round(overall_consistency, 4),
                "has_problems": outlier_count > 0 or excluded_count > 0
            })
            
            processed += 1
            if processed % 50 == 0:
                logger.info(f"[consistency-audit] Processed {processed} people...")
        
        # Sort by outlier count (most problems first), then by consistency (lowest first)
        results.sort(key=lambda x: (-x["outlier_count"], -x["excluded_count"], x["overall_consistency"]))
        
        # Summary
        total_with_problems = sum(1 for r in results if r["has_problems"])
        total_outliers = sum(r["outlier_count"] for r in results)
        total_excluded = sum(r["excluded_count"] for r in results)
        
        logger.info(f"[consistency-audit] Done. {len(results)} people checked, {total_with_problems} have problems, {total_outliers} outliers, {total_excluded} excluded")
        
        return ApiResponse.ok({
            "total_people": len(results),
            "people_with_problems": total_with_problems,
            "total_outliers": total_outliers,
            "total_excluded": total_excluded,
            "outlier_threshold": outlier_threshold,
            "results": results
        })
        
    except Exception as e:
        logger.error(f"[consistency-audit] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="consistency_audit")


# ============ DYNAMIC ROUTES WITH {identifier} ============

@router.get("/{identifier}/embedding-consistency")
async def get_embedding_consistency(
    identifier: str,
    outlier_threshold: float = Query(0.5, description="Similarity below this = outlier"),
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """
    Analyze consistency of person's embeddings to find outliers.
    
    Returns embeddings sorted by similarity to centroid (worst first).
    Outliers are embeddings that don't match the person's "average" face.
    
    Now includes excluded_from_index status.
    """
    try:
        person_id = get_person_id(identifier)
        
        logger.info(f"[consistency] Analyzing embeddings for person {person_id}")
        
        # Get all faces with embeddings for this person (include bbox and image dimensions)
        result = supabase_db.client.table("photo_faces").select(
            "id, photo_id, verified, recognition_confidence, insightface_descriptor, insightface_bbox, excluded_from_index, "
            "gallery_images(id, image_url, original_filename, width, height)"
        ).eq("person_id", person_id).not_.is_("insightface_descriptor", "null").execute()
        
        faces = result.data or []
        
        if len(faces) < 2:
            return ApiResponse.ok({
                "total_embeddings": len(faces),
                "overall_consistency": 1.0 if faces else 0.0,
                "outlier_threshold": outlier_threshold,
                "outlier_count": 0,
                "excluded_count": 0,
                "embeddings": [],
                "message": "Need at least 2 embeddings to analyze consistency"
            })
        
        logger.info(f"[consistency] Found {len(faces)} faces with embeddings")
        
        # Parse embeddings
        embeddings_data = []  # [(embedding, face)]
        for face in faces:
            descriptor = face["insightface_descriptor"]
            if isinstance(descriptor, list):
                emb = np.array(descriptor, dtype=np.float32)
            elif isinstance(descriptor, str):
                emb = np.array(json.loads(descriptor), dtype=np.float32)
            else:
                continue
            
            if len(emb) == 512:
                embeddings_data.append((emb, face))
            else:
                logger.warning(f"[consistency] Invalid embedding dim {len(emb)} for face {face['id']}")
        
        if len(embeddings_data) < 2:
            return ApiResponse.ok({
                "total_embeddings": len(embeddings_data),
                "overall_consistency": 1.0,
                "outlier_threshold": outlier_threshold,
                "outlier_count": 0,
                "excluded_count": 0,
                "embeddings": [],
                "message": "Not enough valid embeddings"
            })
        
        # Get non-excluded for centroid calculation
        non_excluded = [(e, f) for e, f in embeddings_data if not f.get("excluded_from_index")]
        
        if len(non_excluded) < 2:
            # Use all if not enough non-excluded
            centroid_embeddings = [e for e, f in embeddings_data]
        else:
            centroid_embeddings = [e for e, f in non_excluded]
        
        # Calculate centroid (normalized mean)
        embeddings_array = np.array(centroid_embeddings)
        centroid = np.mean(embeddings_array, axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        
        # Calculate similarity to centroid for each embedding
        results = []
        similarities = []
        excluded_count = 0
        
        for emb, face in embeddings_data:
            emb_norm = emb / np.linalg.norm(emb)
            similarity = float(np.dot(emb_norm, centroid))
            
            is_excluded = face.get("excluded_from_index", False)
            if is_excluded:
                excluded_count += 1
            
            if not is_excluded:
                similarities.append(similarity)
            
            gi = face.get("gallery_images") or {}
            
            # Convert bbox to array format [x1, y1, x2, y2]
            bbox_array = convert_bbox_to_array(face.get("insightface_bbox"))
            
            results.append({
                "face_id": face["id"],
                "photo_id": face["photo_id"],
                "image_url": gi.get("image_url"),
                "filename": gi.get("original_filename"),
                "image_width": gi.get("width"),
                "image_height": gi.get("height"),
                "bbox": bbox_array,
                "verified": face.get("verified", False),
                "recognition_confidence": face.get("recognition_confidence"),
                "similarity_to_centroid": round(similarity, 4),
                "is_outlier": similarity < outlier_threshold and not is_excluded,
                "is_excluded": is_excluded
            })
        
        # Sort by similarity (worst first)
        results.sort(key=lambda x: (0 if x["is_excluded"] else 1, x["similarity_to_centroid"]))
        
        # Calculate overall consistency (only from non-excluded)
        overall_consistency = float(np.mean(similarities)) if similarities else 0.0
        outlier_count = sum(1 for r in results if r["is_outlier"])
        
        logger.info(f"[consistency] Overall: {overall_consistency:.3f}, outliers: {outlier_count}, excluded: {excluded_count}")
        
        return ApiResponse.ok({
            "total_embeddings": len(results),
            "overall_consistency": round(overall_consistency, 4),
            "outlier_threshold": outlier_threshold,
            "outlier_count": outlier_count,
            "excluded_count": excluded_count,
            "embeddings": results
        })
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"[consistency] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="get_embedding_consistency")
