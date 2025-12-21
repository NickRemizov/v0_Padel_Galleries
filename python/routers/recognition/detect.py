"""
Face detection endpoints.
- POST /detect-faces
- POST /process-photo

Features:
- Custom exceptions (DetectionError, PhotoNotFoundError)
- ApiResponse format
- DB config for quality filters and threshold
- Adaptive early exit algorithm support
"""

from fastapi import APIRouter, Depends
import numpy as np
import json

from core.config import VERSION
from core.responses import ApiResponse
from core.exceptions import DetectionError, PhotoNotFoundError
from core.logging import get_logger
from models.recognition_schemas import (
    DetectFacesRequest,
    FaceDetectionResponse,
    ProcessPhotoRequest,
    ProcessPhotoResponse,
)
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
            logger.warning(f"Could not get face metrics: {str(e)}")
    
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
        logger.info(f"[v{VERSION}] DETECT FACES REQUEST START")
        logger.info(f"[v{VERSION}] Image URL: {request.image_url}")
        logger.info(f"[v{VERSION}] Apply quality filters: {request.apply_quality_filters}")
        
        # Detect faces
        detected_faces = await face_service.detect_faces(
            request.image_url, 
            apply_quality_filters=request.apply_quality_filters,
            min_detection_score=request.min_detection_score,
            min_face_size=request.min_face_size,
            min_blur_score=request.min_blur_score
        )
        
        logger.info(f"[v{VERSION}] ✓ Detected {len(detected_faces)} faces")
        
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
                "insightface_det_score": float(face["det_score"]),
                "blur_score": float(face.get("blur_score", 0)),
                "embedding": face["embedding"].tolist(),
                "distance_to_nearest": distance_to_nearest,
                "top_matches": top_matches,
            }
            faces_data.append(face_data)
        
        logger.info(f"[v{VERSION}] ✓ Returning {len(faces_data)} faces")
        logger.info(f"[v{VERSION}] DETECT FACES REQUEST END")
        logger.info("=" * 80)
        return {"faces": faces_data}
        
    except Exception as e:
        logger.error(f"[v{VERSION}] ❌ ERROR in detect_faces: {e}", exc_info=True)
        raise DetectionError(f"Failed to detect faces: {str(e)}")


@router.post("/process-photo", response_model=ProcessPhotoResponse)
async def process_photo(
    request: ProcessPhotoRequest,
    face_service=Depends(get_face_service),
    supabase_client=Depends(get_supabase_client)
):
    """
    Process photo for face detection and recognition.
    Always uses DB config for quality filters and threshold.
    """
    try:
        # Load config from DB
        config = await supabase_client.get_recognition_config()
        quality_filters_config = config.get('quality_filters', {})
        db_confidence_threshold = config.get('confidence_thresholds', {}).get('high_data', 0.60)
        
        logger.info("=" * 80)
        logger.info(f"[v{VERSION}] PROCESS PHOTO REQUEST START")
        logger.info(f"[v{VERSION}] Photo ID: {request.photo_id}")
        logger.info(f"[v{VERSION}] Force redetect: {request.force_redetect}")
        logger.info(f"[v{VERSION}] Apply quality filters: {request.apply_quality_filters}")
        
        # Always use DB config for quality filters (ignore frontend defaults)
        if request.apply_quality_filters:
            face_service.quality_filters = {
                "min_detection_score": quality_filters_config.get('min_detection_score', 0.7),
                "min_face_size": quality_filters_config.get('min_face_size', 80),
                "min_blur_score": quality_filters_config.get('min_blur_score', 80)
            }
            logger.info(f"[v{VERSION}] Quality filters from DB: {face_service.quality_filters}")
        
        logger.info(f"[v{VERSION}] Confidence threshold from DB: {db_confidence_threshold}")
        
        if request.force_redetect:
            logger.info(f"[v{VERSION}] Force redetect - deleting existing faces")
            supabase_client.client.table("photo_faces").delete().eq("photo_id", request.photo_id).execute()
        
        # Check existing faces in database
        existing_result = supabase_client.client.table("photo_faces").select(
            "id, person_id, recognition_confidence, verified, insightface_bbox, insightface_det_score, insightface_descriptor, blur_score"
        ).eq("photo_id", request.photo_id).execute()
        
        existing_faces = existing_result.data or []
        logger.info(f"[v{VERSION}] Found {len(existing_faces)} existing faces in DB")
        
        # Track if we need to rebuild index
        index_rebuilt = False
        
        if len(existing_faces) == 0:
            logger.info(f"[v{VERSION}] Case 1: New photo - detecting faces")
            
            # Get image URL
            photo_response = supabase_client.client.table("gallery_images").select("image_url").eq("id", request.photo_id).execute()
            if not photo_response.data or len(photo_response.data) == 0:
                raise PhotoNotFoundError(request.photo_id)
            
            image_url = photo_response.data[0]["image_url"]
            
            # Detect faces
            detected_faces = await face_service.detect_faces(image_url, apply_quality_filters=request.apply_quality_filters)
            logger.info(f"[v{VERSION}] ✓ Detected {len(detected_faces)} faces")
            
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
                
                # Use DB threshold for recognition
                person_id, rec_confidence = await face_service.recognize_face(
                    embedding, 
                    confidence_threshold=db_confidence_threshold
                )
                
                logger.info(f"[v{VERSION}] Face {idx+1}: person_id={person_id}, confidence={rec_confidence}, blur={blur_score:.1f}")
                
                # Get metrics for details dialog
                distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
                
                # Save to DB
                insert_data = {
                    "photo_id": request.photo_id,
                    "person_id": person_id,
                    "insightface_bbox": bbox,
                    "insightface_det_score": det_score,
                    "blur_score": blur_score,
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
            
            logger.info(f"[v{VERSION}] ✓ Saved {len(saved_faces)} faces")
            
            # Rebuild index if any face has person_id
            faces_with_person = [f for f in saved_faces if f.get("person_id")]
            if len(faces_with_person) > 0:
                try:
                    logger.info(f"[v{VERSION}] Rebuilding index ({len(faces_with_person)} recognized faces)...")
                    rebuild_result = await face_service.rebuild_players_index()
                    if rebuild_result.get("success"):
                        index_rebuilt = True
                        logger.info(f"[v{VERSION}] ✓ Index rebuilt: {rebuild_result.get('new_descriptor_count')} descriptors")
                except Exception as index_error:
                    logger.error(f"[v{VERSION}] Error rebuilding index: {index_error}")
            
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
                    "insightface_det_score": face.get("insightface_det_score"),
                    "blur_score": face.get("blur_score") or metrics.get("blur_score"),
                    "distance_to_nearest": metrics.get("distance_to_nearest"),
                    "top_matches": metrics.get("top_matches", []),
                    "people": person_data,
                    "index_rebuilt": index_rebuilt,
                })
            
            logger.info(f"[v{VERSION}] PROCESS PHOTO REQUEST END")
            logger.info("=" * 80)
            
            return {"success": True, "data": response_faces, "error": None, "index_rebuilt": index_rebuilt}
        
        logger.info(f"[v{VERSION}] Case 2: Existing faces - checking for unverified")
        
        unverified_faces = [f for f in existing_faces if not f["person_id"] or not f["verified"]]
        logger.info(f"[v{VERSION}] Found {len(unverified_faces)} unverified faces")
        
        face_metrics = {}
        faces_updated = False
        
        if len(unverified_faces) > 0:
            logger.info(f"[v{VERSION}] Recognizing {len(unverified_faces)} unverified faces")
            
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
                
                distance_to_nearest, top_matches = _get_face_metrics(face_service, supabase_client, embedding)
                face_metrics[face["id"]] = {
                    "distance_to_nearest": distance_to_nearest,
                    "top_matches": top_matches,
                }
                
                # Use DB threshold
                person_id, rec_confidence = await face_service.recognize_face(
                    embedding, 
                    confidence_threshold=db_confidence_threshold
                )
                
                if person_id and rec_confidence:
                    logger.info(f"[v{VERSION}] Face {face['id']}: person_id={person_id}, confidence={rec_confidence}")
                    
                    supabase_client.client.table("photo_faces").update({
                        "person_id": person_id,
                        "recognition_confidence": rec_confidence,
                    }).eq("id", face["id"]).execute()
                    
                    faces_updated = True
                    logger.info(f"[v{VERSION}] ✓ Updated face {face['id']}")
        
        # Get metrics for verified faces
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
        
        # Rebuild index if faces were updated
        if faces_updated:
            try:
                logger.info(f"[v{VERSION}] Rebuilding index after updating faces...")
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_rebuilt = True
                    logger.info(f"[v{VERSION}] ✓ Index rebuilt: {rebuild_result.get('new_descriptor_count')} descriptors")
            except Exception as index_error:
                logger.error(f"[v{VERSION}] Error rebuilding index: {index_error}")
        
        # Load all faces
        final_result = supabase_client.client.table("photo_faces").select(
            "id, person_id, recognition_confidence, verified, insightface_bbox, insightface_det_score, blur_score, people(id, real_name, telegram_name)"
        ).eq("photo_id", request.photo_id).execute()
        
        response_faces = []
        for face in (final_result.data or []):
            metrics = face_metrics.get(face["id"], {})
            response_faces.append({
                **face,
                "blur_score": face.get("blur_score") or metrics.get("blur_score"),
                "distance_to_nearest": metrics.get("distance_to_nearest"),
                "top_matches": metrics.get("top_matches", []),
                "index_rebuilt": index_rebuilt,
            })
        
        logger.info(f"[v{VERSION}] ✓ Returning {len(response_faces)} faces, index_rebuilt={index_rebuilt}")
        logger.info(f"[v{VERSION}] PROCESS PHOTO REQUEST END")
        logger.info("=" * 80)
        
        return {"success": True, "data": response_faces, "error": None, "index_rebuilt": index_rebuilt}
        
    except PhotoNotFoundError:
        raise
    except Exception as e:
        logger.error(f"[v{VERSION}] ❌ ERROR in process_photo: {e}", exc_info=True)
        return ApiResponse.fail(f"Failed to process photo: {str(e)}", code="DETECTION_ERROR").model_dump()
