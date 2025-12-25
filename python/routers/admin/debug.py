"""
Admin API - Debug Gallery and Photos
Debug gallery/photo processing status and fix inconsistencies
"""

from typing import Optional, Dict, List
from fastapi import APIRouter, Query
import numpy as np

from core.responses import ApiResponse
from core.logging import get_logger

from .helpers import get_supabase_db, get_face_service

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


@router.get("/debug-photo")
async def debug_photo(photo_id: str = Query(..., description="Photo ID to debug")):
    """
    Debug a specific photo: show all faces, their DB state, and what recognition returns.
    
    This helps diagnose why some faces get 100% and others get 83% during re-recognition.
    """
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    if not supabase_db or not face_service:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db.client
        
        # 1. Get photo info
        photo_result = client.table("gallery_images").select(
            "id, image_url, original_filename, gallery_id, galleries(title, shoot_date)"
        ).eq("id", photo_id).single().execute()
        
        if not photo_result.data:
            return ApiResponse.fail("Photo not found", code="NOT_FOUND").model_dump()
        
        photo = photo_result.data
        
        # 2. Get all faces from DB for this photo
        faces_result = client.table("photo_faces").select(
            "id, person_id, verified, recognition_confidence, insightface_descriptor, insightface_bbox, excluded_from_index, "
            "people(id, real_name, telegram_name)"
        ).eq("photo_id", photo_id).execute()
        
        db_faces = faces_result.data or []
        
        # 3. For each face with person_id, check what's in the index for that person
        face_analysis = []
        
        for face in db_faces:
            face_info = {
                "face_id": face["id"],
                "person_id": face.get("person_id"),
                "person_name": face.get("people", {}).get("real_name") if face.get("people") else None,
                "db_state": {
                    "verified": face.get("verified"),
                    "recognition_confidence": face.get("recognition_confidence"),
                    "excluded_from_index": face.get("excluded_from_index"),
                    "has_descriptor": face.get("insightface_descriptor") is not None,
                    "bbox": face.get("insightface_bbox")
                },
                "index_info": None,
                "recognition_test": None
            }
            
            person_id = face.get("person_id")
            
            # 4. If person_id exists, check ALL embeddings for this person in DB (what goes into index)
            if person_id:
                person_embeddings = client.table("photo_faces").select(
                    "id, verified, recognition_confidence, excluded_from_index"
                ).eq("person_id", person_id).not_.is_("insightface_descriptor", "null").execute()
                
                all_person_faces = person_embeddings.data or []
                
                # What actually goes into index (excluded_from_index = false)
                indexed_faces = [f for f in all_person_faces if not f.get("excluded_from_index")]
                
                face_info["index_info"] = {
                    "total_embeddings_for_person": len(all_person_faces),
                    "indexed_embeddings": len(indexed_faces),
                    "excluded_embeddings": len(all_person_faces) - len(indexed_faces),
                    "indexed_details": [
                        {
                            "face_id": f["id"][:8] + "...",
                            "verified": f.get("verified"),
                            "confidence": f.get("recognition_confidence"),
                            # This is what goes into index as source_confidence:
                            "index_source_conf": f.get("recognition_confidence") or (1.0 if f.get("verified") else 0.0)
                        }
                        for f in indexed_faces[:10]  # Show first 10
                    ]
                }
            
            # 5. If face has descriptor, test recognition
            if face.get("insightface_descriptor"):
                try:
                    descriptor = face["insightface_descriptor"]
                    if isinstance(descriptor, str):
                        import json
                        descriptor = json.loads(descriptor)
                    embedding = np.array(descriptor, dtype=np.float32)
                    
                    # Run recognition
                    recognized_person_id, confidence = await face_service.recognize_face(embedding)
                    
                    face_info["recognition_test"] = {
                        "recognized_person_id": recognized_person_id,
                        "final_confidence": round(confidence, 4) if confidence else None,
                        "matches_db_person": recognized_person_id == person_id if person_id else None
                    }
                except Exception as e:
                    face_info["recognition_test"] = {"error": str(e)}
            
            face_analysis.append(face_info)
        
        # 6. Summary
        summary = {
            "total_faces": len(db_faces),
            "faces_with_person": len([f for f in db_faces if f.get("person_id")]),
            "faces_verified_in_db": len([f for f in db_faces if f.get("verified")]),
            "faces_with_100_conf": len([f for f in db_faces if f.get("recognition_confidence") == 1.0]),
            "faces_with_other_conf": len([f for f in db_faces if f.get("recognition_confidence") and f.get("recognition_confidence") != 1.0]),
            "problem_faces": len([f for f in db_faces if f.get("verified") and f.get("recognition_confidence") != 1.0])
        }
        
        return ApiResponse.ok({
            "photo": {
                "id": photo["id"],
                "filename": photo["original_filename"],
                "image_url": photo["image_url"],
                "gallery": photo.get("galleries", {}).get("title") if photo.get("galleries") else None
            },
            "summary": summary,
            "faces": face_analysis,
            "hint": "Look for faces where db_state.verified=true but db_state.recognition_confidence != 1.0"
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in debug-photo: {e}", exc_info=True)
        return ApiResponse.fail(f"Debug failed: {str(e)}", code="DEBUG_ERROR").model_dump()


@router.get("/debug-person")
async def debug_person(person_id: str = Query(..., description="Person ID to debug")):
    """
    Debug a specific person: show all their embeddings and what goes into the index.
    """
    supabase_db = get_supabase_db()
    
    if not supabase_db:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db.client
        
        # 1. Get person info
        person_result = client.table("people").select("*").eq("id", person_id).single().execute()
        
        if not person_result.data:
            return ApiResponse.fail("Person not found", code="NOT_FOUND").model_dump()
        
        person = person_result.data
        
        # 2. Get all faces for this person
        faces_result = client.table("photo_faces").select(
            "id, photo_id, verified, recognition_confidence, excluded_from_index, insightface_descriptor, "
            "gallery_images(original_filename, galleries(title))"
        ).eq("person_id", person_id).not_.is_("insightface_descriptor", "null").execute()
        
        all_faces = faces_result.data or []
        
        # 3. Analyze each face
        face_analysis = []
        for face in all_faces:
            verified = face.get("verified") or False
            conf = face.get("recognition_confidence")
            excluded = face.get("excluded_from_index") or False
            
            # Calculate what would go into index
            index_source_conf = conf if conf is not None else (1.0 if verified else 0.0)
            
            # Detect problems
            problems = []
            if verified and conf is not None and conf < 0.9999:
                problems.append(f"VERIFIED_BUT_CONF_{conf:.2f}")
            if not verified and conf is not None and conf >= 0.9999:
                problems.append(f"NOT_VERIFIED_BUT_CONF_100")
            
            face_analysis.append({
                "face_id": face["id"],
                "photo_id": face["photo_id"],
                "filename": face.get("gallery_images", {}).get("original_filename") if face.get("gallery_images") else None,
                "gallery": face.get("gallery_images", {}).get("galleries", {}).get("title") if face.get("gallery_images") and face.get("gallery_images").get("galleries") else None,
                "verified": verified,
                "recognition_confidence": conf,
                "excluded_from_index": excluded,
                "index_source_conf": index_source_conf,
                "in_index": not excluded,
                "problems": problems
            })
        
        # 4. Summary
        indexed_faces = [f for f in face_analysis if f["in_index"]]
        problem_faces = [f for f in face_analysis if f["problems"]]
        
        # What source_conf values are in index?
        index_confs = [f["index_source_conf"] for f in indexed_faces]
        
        summary = {
            "total_faces": len(all_faces),
            "indexed_faces": len(indexed_faces),
            "excluded_faces": len(all_faces) - len(indexed_faces),
            "verified_count": len([f for f in face_analysis if f["verified"]]),
            "problem_faces": len(problem_faces),
            "index_source_conf_distribution": {
                "100%": len([c for c in index_confs if c >= 0.9999]),
                "80-99%": len([c for c in index_confs if 0.80 <= c < 0.9999]),
                "60-79%": len([c for c in index_confs if 0.60 <= c < 0.80]),
                "<60%": len([c for c in index_confs if c < 0.60])
            }
        }
        
        return ApiResponse.ok({
            "person": {
                "id": person["id"],
                "real_name": person.get("real_name"),
                "telegram_name": person.get("telegram_name")
            },
            "summary": summary,
            "problem_faces": problem_faces[:20],
            "all_faces": face_analysis[:50],
            "hint": "Problem faces have verified=true but confidence<100% - these cause 83% results during re-recognition"
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in debug-person: {e}", exc_info=True)
        return ApiResponse.fail(f"Debug failed: {str(e)}", code="DEBUG_ERROR").model_dump()


@router.get("/debug-recognition")
async def debug_recognition(
    face_id: str = Query(..., description="Face ID to test recognition for"),
    k: int = Query(50, description="Number of candidates to return")
):
    """
    Debug recognition: load embedding by face_id, query HNSW, show ALL candidates.
    
    Shows:
    - All k candidates returned by HNSW
    - Their similarity, source_confidence, verified status
    - Calculated final_confidence for each
    - Which one wins and why
    """
    import json
    
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    if not supabase_db or not face_service:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db.client
        index = face_service._players_index
        
        if not index.is_loaded():
            return ApiResponse.fail("Index not loaded", code="INDEX_ERROR").model_dump()
        
        # Load face from DB
        face_result = client.table("photo_faces").select(
            "id, person_id, insightface_descriptor, verified, recognition_confidence, people(real_name)"
        ).eq("id", face_id).execute()
        
        if not face_result.data:
            return ApiResponse.fail(f"Face {face_id} not found", code="NOT_FOUND").model_dump()
        
        face = face_result.data[0]
        descriptor = face.get("insightface_descriptor")
        
        if not descriptor:
            return ApiResponse.fail(f"Face {face_id} has no descriptor", code="NO_DESCRIPTOR").model_dump()
        
        # Parse embedding
        if isinstance(descriptor, str):
            embedding = np.array(json.loads(descriptor), dtype=np.float32)
        elif isinstance(descriptor, list):
            embedding = np.array(descriptor, dtype=np.float32)
        else:
            return ApiResponse.fail(f"Unknown descriptor type: {type(descriptor)}", code="INVALID_DESCRIPTOR").model_dump()
        
        k = min(k, index.get_count())
        
        # Query HNSW
        person_ids, similarities, verified_flags, source_confidences = index.query(embedding, k=k)
        
        # Build detailed candidate list
        candidates = []
        best_person_id = None
        best_final_confidence = 0.0
        best_iteration = 0
        early_exit_at = None
        
        for i in range(len(person_ids)):
            person_id = person_ids[i]
            similarity = similarities[i]
            source_conf = source_confidences[i]
            is_verified = verified_flags[i]
            
            # Check early exit condition
            if similarity < best_final_confidence and early_exit_at is None:
                early_exit_at = i + 1
            
            # Calculate final
            final_confidence = source_conf * similarity
            
            # Track winner
            is_new_best = False
            if final_confidence > best_final_confidence:
                best_final_confidence = final_confidence
                best_person_id = person_id
                best_iteration = i + 1
                is_new_best = True
            
            candidates.append({
                "iteration": i + 1,
                "person_id": person_id,
                "similarity": round(similarity, 6),
                "source_confidence": round(source_conf, 6),
                "verified": is_verified,
                "final_confidence": round(final_confidence, 6),
                "is_new_best": is_new_best,
                "would_early_exit": early_exit_at is not None and i + 1 >= early_exit_at
            })
        
        # Group by person_id for analysis
        person_summary = {}
        for c in candidates:
            pid = c["person_id"]
            if pid not in person_summary:
                person_summary[pid] = {
                    "count": 0,
                    "best_final": 0,
                    "best_similarity": 0,
                    "has_verified": False
                }
            person_summary[pid]["count"] += 1
            if c["final_confidence"] > person_summary[pid]["best_final"]:
                person_summary[pid]["best_final"] = c["final_confidence"]
            if c["similarity"] > person_summary[pid]["best_similarity"]:
                person_summary[pid]["best_similarity"] = c["similarity"]
            if c["verified"]:
                person_summary[pid]["has_verified"] = True
        
        return ApiResponse.ok({
            "face_info": {
                "face_id": face_id,
                "current_person_id": face.get("person_id"),
                "current_person_name": face.get("people", {}).get("real_name") if face.get("people") else None,
                "db_verified": face.get("verified"),
                "db_recognition_confidence": face.get("recognition_confidence")
            },
            "query_k": k,
            "total_candidates": len(candidates),
            "winner": {
                "person_id": best_person_id,
                "final_confidence": round(best_final_confidence, 6),
                "won_at_iteration": best_iteration
            },
            "early_exit_at": early_exit_at,
            "person_summary": person_summary,
            "candidates": candidates[:30],
            "hint": "Look at candidates to see if verified embeddings have lower similarity than non-verified"
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in debug-recognition: {e}", exc_info=True)
        return ApiResponse.fail(f"Debug failed: {str(e)}", code="DEBUG_ERROR").model_dump()


@router.post("/fix-person-confidence")
async def fix_person_confidence(person_id: str = Query(..., description="Person ID to fix")):
    """
    Fix all faces for a person: set recognition_confidence=1.0 where verified=true.
    """
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    if not supabase_db or not face_service:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db.client
        
        # Update all verified faces for this person to confidence=1.0
        result = client.table("photo_faces").update({
            "recognition_confidence": 1.0
        }).eq("person_id", person_id).eq("verified", True).select("id").execute()
        
        fixed_count = len(result.data) if result.data else 0
        
        # Rebuild index
        rebuild_result = await face_service.rebuild_players_index()
        
        return ApiResponse.ok({
            "fixed_faces": fixed_count,
            "index_rebuilt": rebuild_result.get("success"),
            "new_descriptor_count": rebuild_result.get("new_descriptor_count")
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in fix-person-confidence: {e}", exc_info=True)
        return ApiResponse.fail(f"Fix failed: {str(e)}", code="FIX_ERROR").model_dump()
