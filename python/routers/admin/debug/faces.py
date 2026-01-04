"""
Admin Debug - Face Operations

Endpoints:
- GET /debug-photo   - Debug specific photo faces
- GET /debug-person  - Debug specific person embeddings
- POST /fix-person-confidence - Fix confidence for verified faces
"""

import json
from fastapi import APIRouter, Query
import numpy as np

from core.responses import ApiResponse
from core.logging import get_logger

from ..helpers import get_supabase_db, get_face_service

logger = get_logger(__name__)
router = APIRouter()


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
            "people(id, real_name, telegram_full_name)"
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
                "telegram_full_name": person.get("telegram_full_name")
            },
            "summary": summary,
            "problem_faces": problem_faces[:20],
            "all_faces": face_analysis[:50],
            "hint": "Problem faces have verified=true but confidence<100% - these cause 83% results during re-recognition"
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in debug-person: {e}", exc_info=True)
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
