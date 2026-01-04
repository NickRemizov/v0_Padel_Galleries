"""
Face detection endpoints.
- POST /detect-faces
- POST /process-photo

Features:
- Custom exceptions (DetectionError, PhotoNotFoundError)
- ApiResponse format
- DB config for quality filters and threshold
- Adaptive early exit algorithm support

v2.0: process-photo is READ-ONLY for navigation (no DB writes, no index rebuild)
      DB changes happen only in batch-verify when user clicks Save
v2.1: Unified to ApiResponse format
v2.2: CASE 2 now runs recognition for unverified faces (cheap index search)
v2.3: Separate search_threshold (for finding candidates) and save_threshold (for DB)
      - search_threshold: 0.30 without filters, config with filters
      - save_threshold: ALWAYS config value (e.g. 0.60)
      - Boxes saved always, person_id only if confidence >= save_threshold
"""

from fastapi import APIRouter, Depends
import numpy as np
import json

from core.config import VERSION
from core.responses import ApiResponse
from core.exceptions import DetectionError, PhotoNotFoundError
from core.logging import get_logger
from .dependencies import get_face_service, get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


def _get_face_metrics(face_service, supabase_client, embedding: np.ndarray):
    """
    Helper function to get distance_to_nearest and top_matches from HNSWLIB index.
    
    Returns:
        tuple: (distance_to_nearest, top_matches)
    """
    distance_to_nearest = None
    top_matches = []
    
    has_index = hasattr(face_service, 'players_index') and face_service.players_index is not None
    index_count = face_service.players_index.get_current_count() if has_index else 0
    
    if has_index and index_count > 0:
        try:
            k = min(3, index_count)
            labels, distances = face_service.players_index.knn_query(embedding.reshape(1, -1), k=k)
            
            if len(distances) > 0 and len(distances[0]) > 0:
                distance_to_nearest = float(distances[0][0])
                
                for i, (label_idx, distance) in enumerate(zip(labels[0], distances[0])):
                    if i >= 3:
                        break
                    
                    if not hasattr(face_service, 'player_ids_map') or len(face_service.player_ids_map) == 0:
                        break
                    
                    person_id_match = face_service.player_ids_map[int(label_idx)]
                    
                    person_response = supabase_client.client.table("people").select(
                        "real_name"
                    ).eq("id", person_id_match).execute()
                    
                    person_name = "Unknown"
                    if person_response.data and len(person_response.data) > 0:
                        person_name = person_response.data[0].get("real_name", "Unknown")
                    
                    similarity = 1.0 - float(distance)
                    top_matches.append({
                        "person_id": person_id_match,
                        "name": person_name,
                        "similarity": similarity
                    })
        except Exception as e:
            logger.warning(f"Could not get face metrics: {str(e)}")
    
    return distance_to_nearest, top_matches


@router.post("/detect-faces")
async def detect_faces(
    request: dict,
    face_service=Depends(get_face_service)
):
    """Detect faces on an image using InsightFace"""
    supabase_client = get_supabase_client()
    try:
        image_url = request.get("image_url")
        apply_quality_filters = request.get("apply_quality_filters", True)
        min_detection_score = request.get("min_detection_score")
        min_face_size = request.get("min_face_size")
        min_blur_score = request.get("min_blur_score")
        
        logger.info("=" * 80)
        logger.info(f"[v{VERSION}] DETECT FACES REQUEST START")
        logger.info(f"[v{VERSION}] Image URL: {image_url}")
        logger.info(f"[v{VERSION}] Apply quality filters: {apply_quality_filters}")
        
        detected_faces = await face_service.detect_faces(
            image_url, 
            apply_quality_filters=apply_quality_filters,
            min_detection_score=min_detection_score,
            min_face_size=min_face_size,
            min_blur_score=min_blur_score
        )
        
        logger.info(f"[v{VERSION}] Detected {len(detected_faces)} faces")
        
        faces_data = []
        for idx, face in enumerate(detected_faces):
            embedding = face["embedding"]
            
            person_id, confidence = await face_service.recognize_face(embedding, confidence_threshold=0.0)
            
            distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
            
            face_data = {
                "insightface_bbox": {
                    "x": float(face["bbox"][0]),
                    "y": float(face["bbox"][1]),
                    "width": float(face["bbox"][2] - face["bbox"][0]),
                    "height": float(face["bbox"][3] - face["bbox"][1]),
                },
                "insightface_det_score": float(face["det_score"]),
                "blur_score": float(face.get("blur_score", 0)),
                "embedding": face["embedding"].tolist(),
                "distance_to_nearest": distance_to_nearest,
                "top_matches": top_matches,
            }
            faces_data.append(face_data)
        
        logger.info(f"[v{VERSION}] Returning {len(faces_data)} faces")
        logger.info(f"[v{VERSION}] DETECT FACES REQUEST END")
        logger.info("=" * 80)
        
        return ApiResponse.ok({"faces": faces_data}).model_dump()
        
    except Exception as e:
        logger.error(f"[v{VERSION}] ERROR in detect_faces: {e}", exc_info=True)
        raise DetectionError(f"Failed to detect faces: {str(e)}")


@router.post("/process-photo")
async def process_photo(
    request: dict,
    face_service=Depends(get_face_service),
    supabase_client=Depends(get_supabase_client)
):
    """
    Process photo for face detection and recognition.
    
    v2.3: Separate thresholds for search vs save:
    - search_threshold: used to find candidates (0.30 without filters, config with filters)
    - save_threshold: used to decide what to save to DB (ALWAYS config, e.g. 0.60)
    
    This allows showing low-confidence matches in UI (via top_matches) while
    only saving high-confidence matches to the database.
    """
    try:
        photo_id = request.get("photo_id")
        force_redetect = request.get("force_redetect", False)
        apply_quality_filters = request.get("apply_quality_filters", True)

        # Quality params from request (override DB config if provided)
        req_min_detection_score = request.get("min_detection_score")
        req_min_face_size = request.get("min_face_size")
        req_min_blur_score = request.get("min_blur_score")

        # Load config from DB (sync method - no await)
        config = supabase_client.get_recognition_config()
        quality_filters_config = config.get('quality_filters', {})
        db_confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.60)
        
        # v2.3: Separate thresholds
        # search_threshold: for finding candidates (low without filters to show options)
        search_threshold = db_confidence_threshold if apply_quality_filters else 0.30
        # save_threshold: for DB writes (ALWAYS config value)
        save_threshold = db_confidence_threshold
        
        logger.info("=" * 80)
        logger.info(f"[v{VERSION}] PROCESS PHOTO REQUEST START")
        logger.info(f"[v{VERSION}] Photo ID: {photo_id}")
        logger.info(f"[v{VERSION}] Force redetect: {force_redetect}")
        logger.info(f"[v{VERSION}] Apply quality filters: {apply_quality_filters}")
        logger.info(f"[v{VERSION}] Search threshold: {search_threshold}, Save threshold: {save_threshold}")
        
        if apply_quality_filters:
            # Use request params if provided, otherwise fall back to DB config
            face_service.quality_filters = {
                "min_detection_score": req_min_detection_score if req_min_detection_score is not None else quality_filters_config.get('min_detection_score', 0.7),
                "min_face_size": req_min_face_size if req_min_face_size is not None else quality_filters_config.get('min_face_size', 80),
                "min_blur_score": req_min_blur_score if req_min_blur_score is not None else quality_filters_config.get('min_blur_score', 80)
            }
            logger.info(f"[v{VERSION}] Quality filters (request+DB): {face_service.quality_filters}")
        
        if force_redetect:
            logger.info(f"[v{VERSION}] Force redetect - deleting existing faces")
            supabase_client.client.table("photo_faces").delete().eq("photo_id", photo_id).execute()
        
        existing_result = supabase_client.client.table("photo_faces").select(
            "id, person_id, recognition_confidence, verified, insightface_bbox, insightface_det_score, insightface_descriptor, blur_score"
        ).eq("photo_id", photo_id).execute()
        
        existing_faces = existing_result.data or []
        logger.info(f"[v{VERSION}] Found {len(existing_faces)} existing faces in DB")
        
        # ========================================================================
        # CASE 1: New photo - detect faces and save descriptors
        # ========================================================================
        if len(existing_faces) == 0:
            logger.info(f"[v{VERSION}] Case 1: New photo - detecting faces")
            
            photo_response = supabase_client.client.table("gallery_images").select("image_url").eq("id", photo_id).execute()
            if not photo_response.data or len(photo_response.data) == 0:
                raise PhotoNotFoundError(photo_id)
            
            image_url = photo_response.data[0]["image_url"]
            
            detected_faces = await face_service.detect_faces(
                image_url,
                apply_quality_filters=apply_quality_filters,
                min_detection_score=req_min_detection_score,
                min_face_size=req_min_face_size,
                min_blur_score=req_min_blur_score
            )
            logger.info(f"[v{VERSION}] Detected {len(detected_faces)} faces")
            
            saved_faces = []
            face_metrics = {}
            
            for idx, face in enumerate(detected_faces):
                embedding = face["embedding"]
                bbox = {
                    "x": float(face["bbox"][0]),
                    "y": float(face["bbox"][1]),
                    "width": float(face["bbox"][2] - face["bbox"][0]),
                    "height": float(face["bbox"][3] - face["bbox"][1]),
                }
                det_score = float(face["det_score"])
                blur_score = float(face.get("blur_score", 0))
                
                # Use search_threshold to find candidates
                person_id, rec_confidence = await face_service.recognize_face(
                    embedding, 
                    confidence_threshold=search_threshold
                )
                
                # v2.3: Only save person_id if confidence >= save_threshold
                # Boxes are always saved, but person_id only if high confidence
                save_person_id = None
                save_confidence = None
                if person_id and rec_confidence and rec_confidence >= save_threshold:
                    save_person_id = person_id
                    save_confidence = rec_confidence
                    logger.info(f"[v{VERSION}] Face {idx+1}: SAVED person_id={person_id[:8]}..., confidence={rec_confidence:.3f} (>= {save_threshold})")
                else:
                    conf_str = f"{rec_confidence:.3f}" if rec_confidence else "None"
                    logger.info(f"[v{VERSION}] Face {idx+1}: person_id=None (found={person_id[:8] if person_id else 'None'}..., conf={conf_str} < {save_threshold})")
                
                distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
                
                insert_data = {
                    "photo_id": photo_id,
                    "person_id": save_person_id,
                    "insightface_bbox": bbox,
                    "insightface_det_score": det_score,
                    "blur_score": blur_score,
                    "recognition_confidence": save_confidence,
                    "verified": False,
                    "insightface_descriptor": f"[{','.join(map(str, embedding.tolist()))}]",
                }
                
                save_response = supabase_client.client.table("photo_faces").insert(insert_data).execute()
                
                if save_response.data:
                    saved_face = save_response.data[0]
                    saved_faces.append(saved_face)
                    face_metrics[saved_face['id']] = {
                        "blur_score": blur_score,
                        "distance_to_nearest": distance_to_nearest,
                        "top_matches": top_matches,
                    }
            
            logger.info(f"[v{VERSION}] Saved {len(saved_faces)} faces")
            
            response_faces = []
            for face in saved_faces:
                if face["person_id"]:
                    person_response = supabase_client.client.table("people").select("id, real_name, telegram_full_name").eq("id", face["person_id"]).execute()
                    person_data = person_response.data[0] if person_response.data else None
                else:
                    person_data = None
                
                metrics = face_metrics.get(face["id"], {})
                response_faces.append({
                    "id": face["id"],
                    "person_id": face["person_id"],
                    "recognition_confidence": face["recognition_confidence"],
                    "verified": face["verified"],
                    "insightface_bbox": face["insightface_bbox"],
                    "insightface_det_score": face.get("insightface_det_score"),
                    "blur_score": face.get("blur_score") or metrics.get("blur_score"),
                    "distance_to_nearest": metrics.get("distance_to_nearest"),
                    "top_matches": metrics.get("top_matches", []),
                    "people": person_data,
                    "index_rebuilt": False,
                })
            
            logger.info(f"[v{VERSION}] PROCESS PHOTO REQUEST END")
            logger.info("=" * 80)
            
            return ApiResponse.ok(response_faces).model_dump()
        
        # ========================================================================
        # CASE 2: Existing faces - recognize unverified faces
        # v2.3: Also uses save_threshold for DB updates
        # ========================================================================
        logger.info(f"[v{VERSION}] Case 2: Existing faces - recognizing unverified")
        
        face_metrics = {}
        recognized_count = 0
        
        for face in existing_faces:
            face_id = face["id"]
            descriptor = face.get("insightface_descriptor")
            
            if not descriptor:
                continue
            
            # Parse embedding
            if isinstance(descriptor, str):
                embedding = np.array(json.loads(descriptor), dtype=np.float32)
            elif isinstance(descriptor, list):
                embedding = np.array(descriptor, dtype=np.float32)
            else:
                continue
            
            # Get metrics for all faces
            distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
            face_metrics[face_id] = {
                "distance_to_nearest": distance_to_nearest,
                "top_matches": top_matches,
            }
            
            # v2.3: Recognize unverified faces, but only save if >= save_threshold
            if not face.get("verified"):
                person_id, rec_confidence = await face_service.recognize_face(
                    embedding, 
                    confidence_threshold=search_threshold
                )
                
                # Only update DB if confidence >= save_threshold
                if person_id and rec_confidence and rec_confidence >= save_threshold:
                    old_person_id = face.get("person_id")
                    old_confidence = face.get("recognition_confidence") or 0
                    
                    # Update if new match or better confidence
                    if person_id != old_person_id or rec_confidence > old_confidence:
                        supabase_client.client.table("photo_faces").update({
                            "person_id": person_id,
                            "recognition_confidence": rec_confidence
                        }).eq("id", face_id).execute()
                        
                        recognized_count += 1
                        logger.info(f"[v{VERSION}] Recognized face {face_id[:8]}: person={person_id[:8]}, confidence={rec_confidence:.3f}")
        
        logger.info(f"[v{VERSION}] Recognized {recognized_count} unverified faces")
        
        # Reload faces after potential updates
        final_result = supabase_client.client.table("photo_faces").select(
            "id, person_id, recognition_confidence, verified, insightface_bbox, insightface_det_score, blur_score, people(id, real_name, telegram_full_name)"
        ).eq("photo_id", photo_id).execute()
        
        response_faces = []
        for face in (final_result.data or []):
            metrics = face_metrics.get(face["id"], {})
            response_faces.append({
                **face,
                "blur_score": face.get("blur_score") or metrics.get("blur_score"),
                "distance_to_nearest": metrics.get("distance_to_nearest"),
                "top_matches": metrics.get("top_matches", []),
                "index_rebuilt": False,
            })
        
        logger.info(f"[v{VERSION}] Returning {len(response_faces)} faces (recognized {recognized_count})")
        logger.info(f"[v{VERSION}] PROCESS PHOTO REQUEST END")
        logger.info("=" * 80)
        
        return ApiResponse.ok(response_faces).model_dump()
        
    except PhotoNotFoundError:
        raise
    except Exception as e:
        logger.error(f"[v{VERSION}] ERROR in process_photo: {e}", exc_info=True)
        return ApiResponse.fail(f"Failed to process photo: {str(e)}", code="DETECTION_ERROR").model_dump()
