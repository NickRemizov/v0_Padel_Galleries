"""
Face detection endpoints.
- POST /detect-faces
- POST /process-photo

v4.0: New recognition algorithm with adaptive early exit
- Formula: final_confidence = source_confidence × similarity
- Early exit when similarity < best_final_confidence
- Quality filters from DB config
"""

from fastapi import APIRouter, HTTPException, Depends
import logging
import numpy as np
import json

from models.recognition_schemas import (
    DetectFacesRequest,
    FaceDetectionResponse,
    ProcessPhotoRequest,
    ProcessPhotoResponse,
)
from .dependencies import get_face_service, get_supabase_client

logger = logging.getLogger(__name__)
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
            # Query index for top 3 matches
            k = min(3, index_count)
            labels, distances = face_service.players_index.knn_query(embedding.reshape(1, -1), k=k)
            
            if len(distances) > 0 and len(distances[0]) > 0:
                distance_to_nearest = float(distances[0][0])
                
                # Get person names for top matches
                for i, (label_idx, distance) in enumerate(zip(labels[0], distances[0])):
                    if i >= 3:
                        break
                    
                    if not hasattr(face_service, 'player_ids_map') or len(face_service.player_ids_map) == 0:
                        break
                    
                    person_id_match = face_service.player_ids_map[int(label_idx)]
                    
                    # Get person name from database
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
            logger.warning(f"[_get_face_metrics] Could not get metrics: {str(e)}")
    
    return distance_to_nearest, top_matches


@router.post("/detect-faces", response_model=FaceDetectionResponse)
async def detect_faces(
    request: DetectFacesRequest,
    face_service=Depends(get_face_service)
):
    """Detect faces on an image using InsightFace"""
    supabase_client = get_supabase_client()
    try:
        logger.info("=" * 80)
        logger.info("[v4.0] ===== DETECT FACES REQUEST START =====")
        logger.info(f"[v4.0] Image URL: {request.image_url}")
        logger.info(f"[v4.0] Apply quality filters: {request.apply_quality_filters}")
        
        # Detect faces
        detected_faces = await face_service.detect_faces(
            request.image_url, 
            apply_quality_filters=request.apply_quality_filters,
            min_detection_score=request.min_detection_score,
            min_face_size=request.min_face_size,
            min_blur_score=request.min_blur_score
        )
        
        logger.info(f"[v4.0] ✓ Detected {len(detected_faces)} faces")
        
        # Debug: Check index status
        has_index = hasattr(face_service, 'players_index') and face_service.players_index is not None
        index_count = face_service.players_index.get_current_count() if has_index else 0
        logger.info(f"[v4.0] Index status: has_index={has_index}, index_count={index_count}")
        
        # Format response
        faces_data = []
        for idx, face in enumerate(detected_faces):
            embedding = face["embedding"]
            
            # recognize_face returns 2-tuple: (person_id, final_confidence)
            person_id, confidence = await face_service.recognize_face(embedding, confidence_threshold=0.0)
            
            # Get metrics from HNSWLIB index
            distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
            
            face_data = {
                "insightface_bbox": {
                    "x": float(face["bbox"][0]),
                    "y": float(face["bbox"][1]),
                    "width": float(face["bbox"][2] - face["bbox"][0]),
                    "height": float(face["bbox"][3] - face["bbox"][1]),
                },
                "confidence": float(face["det_score"]),
                "blur_score": float(face.get("blur_score", 0)),
                "embedding": face["embedding"].tolist(),
                "distance_to_nearest": distance_to_nearest,
                "top_matches": top_matches,
            }
            faces_data.append(face_data)
        
        logger.info(f"[v4.0] ✓ Returning {len(faces_data)} faces")
        logger.info("[v4.0] ===== DETECT FACES REQUEST END =====")
        logger.info("=" * 80)
        return {"faces": faces_data}
        
    except Exception as e:
        logger.error(f"[v4.0] ❌ ERROR in detect_faces: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-photo", response_model=ProcessPhotoResponse)
async def process_photo(
    request: ProcessPhotoRequest,
    face_service=Depends(get_face_service),
    supabase_client=Depends(get_supabase_client)
):
    """
    Process photo for face detection and recognition
    
    FLOW:
    1. Check if faces exist in DB
    2. If force_redetect=True → DELETE all + redetect
    3. If no faces → detect + recognize + SAVE + REBUILD INDEX (if any person_id)
    4. If faces exist → recognize unassigned + UPDATE + REBUILD INDEX (if changed)
    5. Return all faces (WITHOUT embeddings) + metrics for details dialog
    
    Recognition algorithm (v4.0):
    - final_confidence = source_confidence × similarity
    - Natural confidence decay through multiplication
    """
    try:
        # Load config from database
        config = await supabase_client.get_recognition_config()
        quality_filters_config = config.get('quality_filters', {})
        confidence_thresholds = config.get('confidence_thresholds', {})
        db_confidence_threshold = confidence_thresholds.get('high_data', 0.60)
        
        logger.info(f"[v4.0] Config from DB: quality_filters={quality_filters_config}, threshold={db_confidence_threshold}")
        
        # Use DB config for quality filters
        if request.apply_quality_filters:
            face_service.quality_filters = {
                "min_detection_score": quality_filters_config.get('min_detection_score', 0.7),
                "min_face_size": quality_filters_config.get('min_face_size', 80),
                "min_blur_score": quality_filters_config.get('min_blur_score', 100)
            }
            logger.info(f"[v4.0] Quality filters: {face_service.quality_filters}")
        
        logger.info("=" * 80)
        logger.info("[v4.0] ===== PROCESS PHOTO REQUEST START =====")
        logger.info(f"[v4.0] Photo ID: {request.photo_id}")
        logger.info(f"[v4.0] Force redetect: {request.force_redetect}")
        
        if request.force_redetect:
            logger.info("[v4.0] Force redetect - deleting existing faces")
            supabase_client.client.table("photo_faces").delete().eq("photo_id", request.photo_id).execute()
        
        # Check existing faces in database
        existing_result = supabase_client.client.table("photo_faces").select(
            "id, person_id, recognition_confidence, verified, insightface_bbox, insightface_confidence, insightface_descriptor"
        ).eq("photo_id", request.photo_id).execute()
        
        existing_faces = existing_result.data or []
        logger.info(f"[v4.0] Found {len(existing_faces)} existing faces in DB")
        
        index_rebuilt = False
        
        if len(existing_faces) == 0:
            logger.info("[v4.0] Case 1: New photo - detecting faces")
            
            # Get image URL
            photo_response = supabase_client.client.table("gallery_images").select("image_url").eq("id", request.photo_id).execute()
            if not photo_response.data or len(photo_response.data) == 0:
                raise HTTPException(status_code=404, detail="Photo not found")
            
            image_url = photo_response.data[0]["image_url"]
            
            # Detect faces
            detected_faces = await face_service.detect_faces(image_url, apply_quality_filters=request.apply_quality_filters)
            logger.info(f"[v4.0] ✓ Detected {len(detected_faces)} faces")
            
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
                det_confidence = float(face["det_score"])
                blur_score = float(face.get("blur_score", 0))
                
                # recognize_face v4.0: returns (person_id, final_confidence)
                person_id, rec_confidence = await face_service.recognize_face(
                    embedding, 
                    confidence_threshold=db_confidence_threshold
                )
                
                logger.info(f"[v4.0] Face {idx+1}: person={person_id}, confidence={rec_confidence}")
                
                # Get metrics
                distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
                
                # Save to DB
                insert_data = {
                    "photo_id": request.photo_id,
                    "person_id": person_id,
                    "insightface_bbox": bbox,
                    "insightface_confidence": det_confidence,
                    "recognition_confidence": rec_confidence,
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
            
            logger.info(f"[v4.0] ✓ Saved {len(saved_faces)} faces")
            
            # Rebuild index if any face has person_id
            faces_with_person = [f for f in saved_faces if f.get("person_id")]
            if len(faces_with_person) > 0:
                try:
                    rebuild_result = await face_service.rebuild_players_index()
                    if rebuild_result.get("success"):
                        index_rebuilt = True
                        logger.info(f"[v4.0] ✓ Index rebuilt: {rebuild_result.get('new_descriptor_count')} descriptors")
                except Exception as index_error:
                    logger.error(f"[v4.0] Error rebuilding index: {index_error}")
            
            # Build response
            response_faces = []
            for face in saved_faces:
                if face["person_id"]:
                    person_response = supabase_client.client.table("people").select("id, real_name, telegram_name").eq("id", face["person_id"]).execute()
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
                    "insightface_confidence": face["insightface_confidence"],
                    "blur_score": metrics.get("blur_score"),
                    "distance_to_nearest": metrics.get("distance_to_nearest"),
                    "top_matches": metrics.get("top_matches", []),
                    "people": person_data,
                    "index_rebuilt": index_rebuilt,
                })
            
            logger.info("[v4.0] ===== PROCESS PHOTO REQUEST END =====")
            logger.info("=" * 80)
            
            return {"success": True, "data": response_faces, "error": None, "index_rebuilt": index_rebuilt}
        
        # Case 2: Existing faces
        logger.info(f"[v4.0] Case 2: Existing faces - checking for unverified")
        
        unverified_faces = [f for f in existing_faces if not f["person_id"] or not f["verified"]]
        logger.info(f"[v4.0] Found {len(unverified_faces)} unverified faces")
        
        face_metrics = {}
        faces_updated = False
        
        if len(unverified_faces) > 0:
            for face in unverified_faces:
                descriptor = face["insightface_descriptor"]
                if not descriptor:
                    continue
                
                if isinstance(descriptor, str):
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)
                elif isinstance(descriptor, list):
                    embedding = np.array(descriptor, dtype=np.float32)
                else:
                    continue
                
                # Get metrics
                distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
                face_metrics[face["id"]] = {
                    "distance_to_nearest": distance_to_nearest,
                    "top_matches": top_matches,
                }
                
                # recognize_face v4.0
                person_id, rec_confidence = await face_service.recognize_face(
                    embedding, 
                    confidence_threshold=db_confidence_threshold
                )
                
                if person_id and rec_confidence:
                    logger.info(f"[v4.0] Face {face['id']}: person={person_id}, confidence={rec_confidence}")
                    
                    supabase_client.client.table("photo_faces").update({
                        "person_id": person_id,
                        "recognition_confidence": rec_confidence,
                    }).eq("id", face["id"]).execute()
                    
                    faces_updated = True
        
        # Get metrics for verified faces too
        for face in existing_faces:
            if face["id"] not in face_metrics:
                descriptor = face.get("insightface_descriptor")
                if descriptor:
                    if isinstance(descriptor, str):
                        embedding = np.array(json.loads(descriptor), dtype=np.float32)
                    elif isinstance(descriptor, list):
                        embedding = np.array(descriptor, dtype=np.float32)
                    else:
                        continue
                    
                    distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
                    face_metrics[face["id"]] = {
                        "distance_to_nearest": distance_to_nearest,
                        "top_matches": top_matches,
                    }
        
        # Rebuild index if updated
        if faces_updated:
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_rebuilt = True
                    logger.info(f"[v4.0] ✓ Index rebuilt")
            except Exception as index_error:
                logger.error(f"[v4.0] Error rebuilding index: {index_error}")
        
        # Load final data
        final_result = supabase_client.client.table("photo_faces").select(
            "id, person_id, recognition_confidence, verified, insightface_bbox, insightface_confidence, people(id, real_name, telegram_name)"
        ).eq("photo_id", request.photo_id).execute()
        
        response_faces = []
        for face in (final_result.data or []):
            metrics = face_metrics.get(face["id"], {})
            response_faces.append({
                **face,
                "blur_score": metrics.get("blur_score"),
                "distance_to_nearest": metrics.get("distance_to_nearest"),
                "top_matches": metrics.get("top_matches", []),
                "index_rebuilt": index_rebuilt,
            })
        
        logger.info(f"[v4.0] ✓ Returning {len(response_faces)} faces")
        logger.info("[v4.0] ===== PROCESS PHOTO REQUEST END =====")
        logger.info("=" * 80)
        
        return {"success": True, "data": response_faces, "error": None, "index_rebuilt": index_rebuilt}
        
    except Exception as e:
        logger.error(f"[v4.0] ❌ ERROR in process_photo: {e}", exc_info=True)
        
        error_message = str(e)
        if hasattr(e, '__dict__'):
            try:
                error_message = f"{type(e).__name__}: {str(e)}"
            except:
                pass
        
        return {"success": False, "data": None, "error": error_message}
