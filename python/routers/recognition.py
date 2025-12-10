from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict
from services.face_recognition import FaceRecognitionService
from services.supabase_client import SupabaseClient
import logging
import numpy as np
import hdbscan
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

router = APIRouter()

#supabase_client = SupabaseClient()
# async def get_face_service():
#     return FaceRecognitionService()

face_service_instance = None
supabase_client_instance = None

def set_services(face_service: FaceRecognitionService, supabase_client: SupabaseClient):
    global face_service_instance, supabase_client_instance
    face_service_instance = face_service
    supabase_client_instance = supabase_client

class DetectFacesRequest(BaseModel):
    image_url: str
    apply_quality_filters: bool = True
    min_detection_score: float = 0.7
    min_face_size: float = 60.0
    min_blur_score: float = 80.0


class RecognizeFaceRequest(BaseModel):
    embedding: List[float]
    confidence_threshold: Optional[float] = None


class BatchRecognizeRequest(BaseModel):
    gallery_ids: List[str]
    confidence_threshold: Optional[float] = None
    apply_quality_filters: bool = True


class GenerateDescriptorsRequest(BaseModel):
    image_url: str
    faces: List[dict]  # [{person_id, bbox, verified}]


class ProcessPhotoRequest(BaseModel):
    photo_id: str
    force_redetect: bool = False  # Добавлен параметр для принудительной переdetекции
    apply_quality_filters: bool = True  # Параметр применения фильтров качества
    confidence_threshold: Optional[float] = None
    min_detection_score: Optional[float] = None
    min_face_size: Optional[float] = None  # Make min_face_size and min_blur_score Optional to accept null from frontend
    min_blur_score: Optional[float] = None


class ProcessPhotoResponse(BaseModel):
    success: bool
    data: Optional[List[dict]]
    error: Optional[str]


class FaceDetectionResponse(BaseModel):
    faces: List[dict]  # [{insightface_bbox, confidence, blur_score, distance_to_nearest, top_matches}]


class FaceRecognitionResponse(BaseModel):
    person_id: Optional[str]
    confidence: Optional[float]

def generate_face_crop_url(photo_url: str, bbox: dict, img_width: int, img_height: int) -> str:
    """
    Generate Vercel Blob URL with crop parameters for face + 30% padding.
    
    Args:
        photo_url: Full image URL
        bbox: Bounding box dict with x, y, width, height (in pixels)
        img_width: Original image width
        img_height: Original image height
    
    Returns:
        URL with crop parameters
    """
    if not photo_url or not bbox:
        return photo_url
    
    # Get bbox coordinates in pixels
    x = bbox.get('x', 0)
    y = bbox.get('y', 0)
    width = bbox.get('width', 0)
    height = bbox.get('height', 0)
    
    # Calculate 50% padding
    padding_x = width * 0.3
    padding_y = height * 0.3
    
    # Calculate crop coordinates with padding
    crop_x = max(0, int(x - padding_x))
    crop_y = max(0, int(y - padding_y))
    crop_width = int(width + padding_x * 2)
    crop_height = int(height + padding_y * 2)
    
    # Ensure crop doesn't exceed image bounds
    if crop_x + crop_width > img_width:
        crop_width = img_width - crop_x
    if crop_y + crop_height > img_height:
        crop_height = img_height - crop_y
    
    # Generate Vercel Blob crop URL
    # Format: ?width=W&height=H&fit=crop&left=X&top=Y
    crop_params = f"?width={crop_width}&height={crop_height}&fit=crop&left={crop_x}&top={crop_y}"
    
    # If URL already has query params, append with &, otherwise use ?
    if '?' in photo_url:
        return f"{photo_url}&{crop_params.lstrip('?')}"
    else:
        return f"{photo_url}{crop_params}"


@router.post("/detect-faces", response_model=FaceDetectionResponse)
async def detect_faces(
    request: DetectFacesRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance)
):
    """Detect faces on an image using InsightFace"""
    try:
        logger.info("=" * 80)
        logger.info("[v3.1] ===== DETECT FACES REQUEST START =====")
        logger.info(f"[v3.1] Image URL: {request.image_url}")
        logger.info(f"[v3.1] Apply quality filters: {request.apply_quality_filters}")
        logger.info(f"[v3.1] Request timestamp: {__import__('datetime').datetime.now()}")
        
        # Detect faces
        logger.info(f"[v3.1] Calling face_service.detect_faces()...")
        detected_faces = await face_service.detect_faces(
            request.image_url, 
            apply_quality_filters=request.apply_quality_filters,
            min_detection_score=request.min_detection_score,
            min_face_size=request.min_face_size,
            min_blur_score=request.min_blur_score
        )
        
        logger.info(f"[v3.1] ✓ Detected {len(detected_faces)} faces")
        
        # Format response
        faces_data = []
        for idx, face in enumerate(detected_faces):
            logger.info(f"[v3.1] Processing face {idx + 1}/{len(detected_faces)}")
            logger.info(f"[v3.1]   - BBox: {face['bbox']}")
            logger.info(f"[v3.1]   - Det score: {face['det_score']}")
            logger.info(f"[v3.1]   - Blur score: {face.get('blur_score', 0)}")
            logger.info(f"[v3.1]   - Embedding shape: {face['embedding'].shape}")
            
            embedding = face["embedding"]
            
            person_id, confidence = await face_service.recognize_face(embedding, confidence_threshold=0.0)
            
            # Get top 3 matches from HNSWLIB index
            top_matches = []
            distance_to_nearest = None
            
            if hasattr(face_service, 'players_index') and face_service.players_index is not None:
                try:
                    # Query index for top 3 matches
                    labels, distances = face_service.players_index.knn_query(embedding.reshape(1, -1), k=3)
                    
                    if len(distances) > 0 and len(distances[0]) > 0:
                        distance_to_nearest = float(distances[0][0])
                        
                        # Get person names for top matches
                        for i, (label_idx, distance) in enumerate(zip(labels[0], distances[0])):
                            if i >= 3:  # Only top 3
                                break
                            
                            if not hasattr(face_service, 'player_ids_map') or len(face_service.player_ids_map) == 0:
                                logger.warning(f"[v3.1] player_ids_map is empty or not available")
                                break
                            
                            person_id_match = face_service.player_ids_map[int(label_idx)]
                            
                            # Get person name from database
                            person_response = supabase_client_instance.client.table("people").select(
                                "real_name"
                            ).eq("id", person_id_match).execute()
                            
                            person_name = "Unknown"
                            if person_response.data and len(person_response.data) > 0:
                                person_name = person_response.data[0].get("real_name", "Unknown")
                            
                            similarity = 1.0 - float(distance)  # Convert distance to similarity
                            top_matches.append({
                                "person_id": person_id_match,
                                "name": person_name,
                                "similarity": similarity
                            })
                            
                        logger.info(f"[v3.1]   - Distance to nearest: {distance_to_nearest:.4f}")
                        logger.info(f"[v3.1]   - Top matches: {len(top_matches)}")
                except Exception as e:
                    logger.warning(f"[v3.1] Could not get top matches: {str(e)}")
            
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
        
        logger.info(f"[v3.1] ✓ Returning {len(faces_data)} faces to frontend")
        logger.info("[v3.1] ===== DETECT FACES REQUEST END =====")
        logger.info("=" * 80)
        return {"faces": faces_data}
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[v3.1] ❌ ERROR in detect_faces")
        logger.error(f"[v3.1] Error type: {type(e).__name__}")
        logger.error(f"[v3.1] Error message: {str(e)}")
        logger.error(f"[v3.1] Traceback:", exc_info=True)
        logger.error("=" * 80)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recognize-face", response_model=FaceRecognitionResponse)
async def recognize_face(
    request: RecognizeFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance)
):
    """Recognize a single face using the trained model"""
    try:
        config = await supabase_client_instance.get_recognition_config()
        threshold = request.confidence_threshold or config.get('recognition_threshold', 0.60)
        
        logger.info(f"[Recognition] Recognizing face, threshold: {threshold}")
        
        embedding = np.array(request.embedding, dtype=np.float32)
        
        person_id, confidence = await face_service.recognize_face(
            embedding, 
            confidence_threshold=threshold
        )
        
        logger.info(f"[Recognition] Result: person_id={person_id}, confidence={confidence}")
        
        return {
            "person_id": person_id,
            "confidence": confidence,
        }
        
    except Exception as e:
        logger.error(f"[Recognition] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-recognize")
async def batch_recognize(
    request: BatchRecognizeRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance)
):
    """Batch recognize faces in galleries"""
    try:
        config = await supabase_client_instance.get_recognition_config()
        confidence_threshold = request.confidence_threshold or config.get('recognition_threshold', 0.60)
        
        logger.info(f"[v3.22] ===== BATCH RECOGNIZE REQUEST =====")
        logger.info(f"[v3.22] Gallery IDs: {request.gallery_ids}")
        logger.info(f"[v3.22] Confidence Threshold: {confidence_threshold}")
        logger.info(f"[v3.22] Apply quality filters: {request.apply_quality_filters}")
        
        quality_filters = config.get('quality_filters', {})
        min_detection_score = quality_filters.get('min_detection_score', 0.7)
        min_face_size = quality_filters.get('min_face_size', 80.0)
        min_blur_score = quality_filters.get('min_blur_score', 80.0)
        
        logger.info(f"[v3.22] Quality filters loaded:")
        logger.info(f"[v3.22]   min_detection_score: {min_detection_score}")
        logger.info(f"[v3.22]   min_face_size: {min_face_size}")
        logger.info(f"[v3.22]   min_blur_score: {min_blur_score}")
        
        # Get all images from galleries without verified faces
        images = await supabase_client_instance.get_unverified_images(request.gallery_ids)
        
        logger.info(f"[v3.22] Found {len(images)} images to process")
        
        processed = 0
        recognized = 0
        filtered_out = 0
        
        for image in images:
            try:
                # Detect faces (already applies quality filters internally)
                faces = await face_service.detect_faces(image["image_url"], apply_quality_filters=request.apply_quality_filters)
                
                logger.info(f"[v3.22] Detected {len(faces)} faces in image {image['id']} (apply_quality_filters={request.apply_quality_filters})")
                
                for face in faces:
                    det_score = float(face["det_score"])
                    face_width = float(face["bbox"][2] - face["bbox"][0])
                    face_height = float(face["bbox"][3] - face["bbox"][1])
                    face_size = min(face_width, face_height)
                    blur_score = float(face.get("blur_score", 0))
                    
                    if request.apply_quality_filters:
                        # Apply quality filters
                        if det_score < min_detection_score:
                            logger.info(f"[v3.22] Filtered: det_score {det_score:.2f} < {min_detection_score}")
                            filtered_out += 1
                            continue
                        
                        if face_size < min_face_size:
                            logger.info(f"[v3.22] Filtered: face_size {face_size:.1f} < {min_face_size}")
                            filtered_out += 1
                            continue
                        
                        if blur_score < min_blur_score:
                            logger.info(f"[v3.22] Filtered: blur_score {blur_score:.1f} < {min_blur_score}")
                            filtered_out += 1
                            continue
                        
                        logger.info(f"[v3.22] Face passed quality filters: det={det_score:.2f}, size={face_size:.1f}, blur={blur_score:.1f}")
                    
                    # Get embedding
                    embedding = face["embedding"]
                    
                    # Recognize
                    person_id, confidence = await face_service.recognize_face(embedding)
                    
                    logger.info(f"[v3.22] Recognition result for image {image['id']}: person_id={person_id}, confidence={confidence}")
                    
                    # Apply threshold
                    if confidence and (request.confidence_threshold is None or confidence >= request.confidence_threshold):
                        bbox = {
                            "x": float(face["bbox"][0]),
                            "y": float(face["bbox"][1]),
                            "width": float(face["bbox"][2] - face["bbox"][0]),
                            "height": float(face["bbox"][3] - face["bbox"][1]),
                        }
                        
                        await supabase_client_instance.save_photo_face(
                            photo_id=image["id"],
                            person_id=person_id,
                            insightface_bbox=bbox,
                            insightface_descriptor=embedding.tolist(),
                            insightface_confidence=float(face["det_score"]),
                            recognition_confidence=confidence,
                            verified=False,
                        )
                        
                        recognized += 1
                    else:
                        bbox = {
                            "x": float(face["bbox"][0]),
                            "y": float(face["bbox"][1]),
                            "width": float(face["bbox"][2] - face["bbox"][0]),
                            "height": float(face["bbox"][3] - face["bbox"][1]),
                        }
                        
                        await supabase_client_instance.save_photo_face(
                            photo_id=image["id"],
                            person_id=None,
                            insightface_bbox=bbox,
                            insightface_descriptor=embedding.tolist(),
                            insightface_confidence=float(face["det_score"]),
                            recognition_confidence=confidence,
                            verified=False,
                        )
                
                processed += 1
                
            except Exception as e:
                logger.error(f"[v3.22] ERROR processing image {image['id']}: {str(e)}", exc_info=True)
                continue
        
        logger.info(f"[v3.22] ===== END BATCH RECOGNIZE =====")
        logger.info(f"[v3.22] Processed: {processed}, Recognized: {recognized}, Filtered out: {filtered_out}")
        return {
            "success": True,
            "processed": processed,
            "recognized": recognized,
            "filtered_out": filtered_out,
        }
        
    except Exception as e:
        logger.error(f"[v3.22] ERROR in batch_recognize: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cluster-unknown-faces")
async def cluster_unknown_faces(
    gallery_id: str = Query(..., description="ID галереи"),
    min_cluster_size: int = Query(2, description="Минимальный размер кластера"),
):
    """
    Кластеризация неизвестных лиц в галерее с HDBSCAN
    """
    try:
        logger.info(f"Clustering unknown faces for gallery {gallery_id}")
        
        # Get unknown faces
        faces = await supabase_client_instance.get_unknown_faces_from_gallery(gallery_id)
        
        if not faces or len(faces) < min_cluster_size:
            return {
                "clusters": [],
                "ungrouped_faces": []
            }
        
        logger.info(f"Clustering {len(faces)} faces...")
        
        # Extract embeddings
        embeddings = []
        for face in faces:
            descriptor = face["insightface_descriptor"]
            if isinstance(descriptor, list):
                embeddings.append(np.array(descriptor, dtype=np.float32))
            elif isinstance(descriptor, str):
                import json
                embeddings.append(np.array(json.loads(descriptor), dtype=np.float32))
        
        embeddings_array = np.array(embeddings)
        
        # Cluster with HDBSCAN
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=1,
            metric='euclidean',
            cluster_selection_epsilon=0.5
        )
        
        cluster_labels = clusterer.fit_predict(embeddings_array)
        
        logger.info(f"Found {len(set(cluster_labels))} unique labels")
        
        # Group faces by cluster
        clusters_dict = {}
        ungrouped = []
        
        for face, label in zip(faces, cluster_labels):
            if label == -1:
                ungrouped.append(face)
            else:
                if label not in clusters_dict:
                    clusters_dict[label] = []
                clusters_dict[label].append(face)
        
        # Format clusters and sort by size (largest first)
        clusters = []
        for cluster_id, cluster_faces in clusters_dict.items():
            normalized_faces = []
            for face in cluster_faces:
                face = face.copy()
                
                bbox = face.get("insightface_bbox")
                if bbox:
                    face["bbox"] = {
                        "x": bbox.get("x", 0),
                        "y": bbox.get("y", 0),
                        "width": bbox.get("width", 0),
                        "height": bbox.get("height", 0),
                    }
                
                face["image_url"] = face.get("photo_url")
                
                # Remove unnecessary fields
                face.pop("insightface_descriptor", None)
                face.pop("insightface_bbox", None)
                face.pop("photo_url", None)
                face.pop("width", None)
                face.pop("height", None)
                
                normalized_faces.append(face)
            
            clusters.append({
                "cluster_id": int(cluster_id),
                "size": len(normalized_faces),
                "faces": normalized_faces
            })
        
        clusters.sort(key=lambda x: x["size"], reverse=True)
        
        logger.info(f"✓ Returning {len(clusters)} clusters, {len(ungrouped)} ungrouped")
        
        return {
            "clusters": clusters,
            "ungrouped_faces": ungrouped
        }
        
    except Exception as e:
        logger.error(f"Error clustering faces: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reject-face-cluster")
async def reject_face_cluster(
    gallery_id: str,
    face_ids: List[str],
    rejected_by: str,
    reason: Optional[str] = None,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance)
):
    """
    Reject a cluster of faces as not interesting
    """
    try:
        logger.info(f"[v3.23] ===== REJECT FACE CLUSTER =====")
        logger.info(f"[v3.23] Gallery ID: {gallery_id}")
        logger.info(f"[v3.23] Face IDs: {len(face_ids)}")
        logger.info(f"[v3.23] Rejected by: {rejected_by}")
        
        # Get face descriptors
        descriptors = []
        photo_ids = []
        
        for face_id in face_ids:
            response = supabase_client_instance.client.table("photo_faces").select(
                "photo_id, insightface_descriptor"
            ).eq("id", face_id).execute()
            
            if response.data and len(response.data) > 0:
                face = response.data[0]
                descriptor = face["insightface_descriptor"]
                
                if isinstance(descriptor, list):
                    descriptors.append(np.array(descriptor, dtype=np.float32))
                elif isinstance(descriptor, str):
                    import json
                    descriptors.append(np.array(json.loads(descriptor), dtype=np.float32))
                
                photo_ids.append(face["photo_id"])
        
        # Save to rejected_faces table
        success = await supabase_client_instance.reject_face_cluster(
            descriptors=descriptors,
            gallery_id=gallery_id,
            photo_ids=photo_ids,
            rejected_by=rejected_by,
            reason=reason
        )
        
        if success:
            # Delete the photo_faces records
            for face_id in face_ids:
                supabase_client_instance.client.table("photo_faces").delete().eq("id", face_id).execute()
            
            logger.info(f"[v3.23] ✓ Successfully rejected and deleted {len(face_ids)} faces")
        
        return {"success": success}
        
    except Exception as e:
        logger.error(f"[v3.23] ERROR rejecting cluster: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-descriptors")
async def generate_descriptors(request: GenerateDescriptorsRequest, face_service: FaceRecognitionService = Depends(lambda: face_service_instance)):
    """
    Generate descriptors for manually tagged faces
    Called when admin manually assigns people to faces
    """
    try:
        logger.info(f"[v3.26] ===== GENERATE DESCRIPTORS FOR MANUAL TAGS =====")
        logger.info(f"[v3.26] Image URL: {request.image_url}")
        logger.info(f"[v3.26] Faces to process: {len(request.faces)}")
        
        # Detect all faces on the image
        detected_faces = await face_service.detect_faces(request.image_url)
        logger.info(f"[v3.26] Detected {len(detected_faces)} faces on image")
        
        generated_count = 0
        
        for tagged_face in request.faces:
            person_id = tagged_face["person_id"]
            tagged_bbox = tagged_face["bbox"]
            verified = tagged_face.get("verified", True)
            
            logger.info(f"[v3.26] Processing tagged face for person {person_id}")
            logger.info(f"[v3.26]   Tagged bbox: {tagged_bbox}")
            
            # Find matching detected face by IoU
            best_match = None
            best_iou = 0.0
            
            for detected_face in detected_faces:
                detected_bbox = {
                    "x": float(detected_face["bbox"][0]),
                    "y": float(detected_face["bbox"][1]),
                    "width": float(detected_face["bbox"][2] - detected_face["bbox"][0]),
                    "height": float(detected_face["bbox"][3] - detected_face["bbox"][1]),
                }
                
                iou = calculate_iou(tagged_bbox, detected_bbox)
                
                if iou > best_iou:
                    best_iou = iou
                    best_match = detected_face
            
            if best_match and best_iou > 0.3:  # 30% overlap threshold
                logger.info(f"[v3.26]   Found matching detected face (IoU: {best_iou:.2f})")
                
                # Save descriptor to database
                descriptor = best_match["embedding"].tolist()
                photo_id = tagged_face.get("photo_id")
                
                if photo_id:
                    success = await supabase_client_instance.save_face_descriptor(
                        person_id=person_id,
                        descriptor=descriptor,
                        source_image_id=photo_id
                    )
                    
                    if success:
                        generated_count += 1
                        logger.info(f"[v3.26]   ✓ Descriptor saved for person {person_id}")
                    else:
                        logger.error(f"[v3.26]   ✗ Failed to save descriptor")
            else:
                logger.warning(f"[v3.26]   No matching detected face found (best IoU: {best_iou:.2f})")
        
        logger.info(f"[v3.26] ✓ Generated {generated_count}/{len(request.faces)} descriptors")
        logger.info(f"[v3.26] ===== END GENERATE DESCRIPTORS =====")
        
        return {
            "success": True,
            "generated": generated_count,
            "total": len(request.faces)
        }
        
    except Exception as e:
        logger.error(f"[v3.26] ERROR generating descriptors: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rebuild-index")
async def rebuild_index(face_service: FaceRecognitionService = Depends(lambda: face_service_instance)):
    """
    Rebuild the HNSWLIB index from database.
    Call this after adding new face descriptors to make them available for recognition.
    """
    try:
        logger.info(f"[v3.31] ===== REBUILD INDEX REQUEST =====")
        
        result = await face_service.rebuild_players_index()
        
        if result["success"]:
            logger.info(f"[v3.31] ✓ Index rebuilt successfully")
            logger.info(f"[v3.31]   Old count: {result['old_descriptor_count']}")
            logger.info(f"[v3.31]   New count: {result['new_descriptor_count']}")
            logger.info(f"[v3.31]   Unique people: {result['unique_people_count']}")
        else:
            logger.error(f"[v3.31] ✗ Index rebuild failed: {result.get('error')}")
        
        logger.info(f"[v3.31] ===== END REBUILD INDEX =====")
        
        return result
        
    except Exception as e:
        logger.error(f"[v3.31] ERROR rebuilding index: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/missing-descriptors-count")
async def get_missing_descriptors_count():
    """Get count of faces with person_id but no insightface_descriptor"""
    try:
        result = supabase_client_instance.client.table("photo_faces").select(
            "id", count="exact"
        ).not_.is_("person_id", "null").is_("insightface_descriptor", "null").execute()
        
        count = result.count or 0
        logger.info(f"[RegenerateDescriptors] Found {count} faces missing descriptors")
        
        return {"success": True, "count": count}
    except Exception as e:
        logger.error(f"[RegenerateDescriptors] Error getting count: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/missing-descriptors-list")
async def get_missing_descriptors_list():
    """Get list of faces with person_id but no insightface_descriptor"""
    try:
        result = supabase_client_instance.client.table("photo_faces").select(
            "id, photo_id, person_id, insightface_bbox, "
            "people(real_name), "
            "gallery_images(image_url, original_filename, galleries(title))"
        ).not_.is_("person_id", "null").is_("insightface_descriptor", "null").execute()
        
        faces = result.data or []
        logger.info(f"[RegenerateDescriptors] Found {len(faces)} faces missing descriptors")
        
        # Format for frontend
        formatted = []
        for face in faces:
            formatted.append({
                "face_id": face["id"],
                "photo_id": face["photo_id"],
                "person_id": face["person_id"],
                "person_name": face.get("people", {}).get("real_name", "Unknown") if face.get("people") else "Unknown",
                "filename": face.get("gallery_images", {}).get("original_filename", "Unknown") if face.get("gallery_images") else "Unknown",
                "gallery_name": face.get("gallery_images", {}).get("galleries", {}).get("title", "") if face.get("gallery_images") and face.get("gallery_images", {}).get("galleries") else "",
                "image_url": face.get("gallery_images", {}).get("image_url", "") if face.get("gallery_images") else "",
                "bbox": face.get("insightface_bbox")
            })
        
        return {"success": True, "faces": formatted, "count": len(formatted)}
    except Exception as e:
        logger.error(f"[RegenerateDescriptors] Error getting list: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/regenerate-missing-descriptors")
async def regenerate_missing_descriptors(
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance)
):
    """
    Regenerate insightface_descriptor for faces that were manually assigned to people.
    Uses IoU matching to find the corresponding detected face.
    """
    try:
        logger.info("[RegenerateDescriptors] ===== START =====")
        
        # 1. Get faces with person_id but no descriptor
        missing_result = supabase_client_instance.client.table("photo_faces").select(
            "id, photo_id, person_id, insightface_bbox, people(real_name), gallery_images(image_url)"
        ).not_.is_("person_id", "null").is_("insightface_descriptor", "null").execute()
        
        missing_faces = missing_result.data or []
        logger.info(f"[RegenerateDescriptors] Found {len(missing_faces)} faces to regenerate")
        
        if not missing_faces:
            return {
                "success": True,
                "total_faces": 0,
                "regenerated": 0,
                "failed": 0,
                "details": []
            }
        
        regenerated = 0
        failed = 0
        details = []
        
        # 2. Group by photo_id for efficient processing
        faces_by_photo = {}
        for face in missing_faces:
            photo_id = face["photo_id"]
            if photo_id not in faces_by_photo:
                faces_by_photo[photo_id] = []
            faces_by_photo[photo_id].append(face)
        
        logger.info(f"[RegenerateDescriptors] Processing {len(faces_by_photo)} unique photos")
        
        # 3. Process each photo
        for photo_id, photo_faces in faces_by_photo.items():
            try:
                image_url = photo_faces[0].get("gallery_images", {}).get("image_url")
                if not image_url:
                    logger.warning(f"[RegenerateDescriptors] No image URL for photo {photo_id}")
                    for face in photo_faces:
                        failed += 1
                        details.append({
                            "face_id": face["id"],
                            "person_name": face.get("people", {}).get("real_name", "Unknown"),
                            "status": "error",
                            "error": "No image URL"
                        })
                    continue
                
                # Detect faces on this photo
                detected_faces = await face_service.detect_faces(image_url, apply_quality_filters=False)
                
                logger.info(f"[RegenerateDescriptors] Photo {photo_id}: detected {len(detected_faces)} faces")
                
                # 4. Match each missing face to detected face via IoU
                for missing_face in photo_faces:
                    try:
                        manual_bbox = missing_face.get("insightface_bbox")
                        if not manual_bbox:
                            failed += 1
                            details.append({
                                "face_id": missing_face["id"],
                                "person_name": missing_face.get("people", {}).get("real_name", "Unknown"),
                                "status": "error",
                                "error": "No bbox"
                            })
                            continue
                        
                        # Find best matching detected face
                        best_match = None
                        best_iou = 0.0
                        
                        for detected_face in detected_faces:
                            detected_bbox = {
                                "x": float(detected_face["bbox"][0]),
                                "y": float(detected_face["bbox"][1]),
                                "width": float(detected_face["bbox"][2] - detected_face["bbox"][0]),
                                "height": float(detected_face["bbox"][3] - detected_face["bbox"][1]),
                            }
                            
                            iou = calculate_iou(manual_bbox, detected_bbox)
                            
                            if iou > best_iou:
                                best_iou = iou
                                best_match = detected_face
                        
                        # If IoU > 0.5, update descriptor
                        if best_match and best_iou > 0.5:
                            embedding = best_match["embedding"].tolist()
                            
                            supabase_client_instance.client.table("photo_faces").update({
                                "insightface_descriptor": embedding,
                                "insightface_confidence": float(best_match["det_score"]),
                            }).eq("id", missing_face["id"]).execute()
                            
                            regenerated += 1
                            details.append({
                                "face_id": missing_face["id"],
                                "person_name": missing_face.get("people", {}).get("real_name", "Unknown"),
                                "status": "success",
                                "iou": round(best_iou, 3)
                            })
                            
                            logger.info(f"[RegenerateDescriptors] ✓ Regenerated {missing_face['id']} (IoU: {best_iou:.3f})")
                        else:
                            failed += 1
                            details.append({
                                "face_id": missing_face["id"],
                                "person_name": missing_face.get("people", {}).get("real_name", "Unknown"),
                                "status": "error",
                                "error": f"No match (best IoU: {best_iou:.3f})"
                            })
                            logger.warning(f"[RegenerateDescriptors] ✗ No match for {missing_face['id']} (best IoU: {best_iou:.3f})")
                    
                    except Exception as face_error:
                        failed += 1
                        details.append({
                            "face_id": missing_face["id"],
                            "person_name": missing_face.get("people", {}).get("real_name", "Unknown"),
                            "status": "error",
                            "error": str(face_error)
                        })
                        logger.error(f"[RegenerateDescriptors] Error processing face {missing_face['id']}: {str(face_error)}")
            
            except Exception as photo_error:
                logger.error(f"[RegenerateDescriptors] Error processing photo {photo_id}: {str(photo_error)}")
                for face in photo_faces:
                    failed += 1
                    details.append({
                        "face_id": face["id"],
                        "person_name": face.get("people", {}).get("real_name", "Unknown"),
                        "status": "error",
                        "error": str(photo_error)
                    })
        
        logger.info(f"[RegenerateDescriptors] ===== END ===== Total: {len(missing_faces)}, Success: {regenerated}, Failed: {failed}")
        
        return {
            "success": True,
            "total_faces": len(missing_faces),
            "regenerated": regenerated,
            "failed": failed,
            "details": details
        }
    
    except Exception as e:
        logger.error(f"[RegenerateDescriptors] Fatal error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/regenerate-single-descriptor")
async def regenerate_single_descriptor(
    face_id: str = Query(...),
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance)
):
    """Regenerate descriptor for a single face"""
    try:
        # Get face data
        face_result = supabase_client_instance.client.table("photo_faces").select(
            "id, photo_id, person_id, insightface_bbox, "
            "people(real_name), "
            "gallery_images(image_url)"
        ).eq("id", face_id).execute()
        
        if not face_result.data:
            return {"success": False, "error": "Face not found"}
        
        face = face_result.data[0]
        image_url = face.get("gallery_images", {}).get("image_url") if face.get("gallery_images") else None
        
        if not image_url:
            return {"success": False, "error": "No image URL"}
        
        bbox = face.get("insightface_bbox")
        if not bbox:
            return {"success": False, "error": "No bbox stored"}
        
        # Detect faces on image
        detected_faces = await face_service.detect_faces(image_url, apply_quality_filters=False)
        
        if not detected_faces:
            return {"success": False, "error": "No faces detected on image"}
        
        # Find best match by IoU
        best_match = None
        best_iou = 0.0
        
        for detected_face in detected_faces:
            detected_bbox = {
                "x": float(detected_face["bbox"][0]),
                "y": float(detected_face["bbox"][1]),
                "width": float(detected_face["bbox"][2] - detected_face["bbox"][0]),
                "height": float(detected_face["bbox"][3] - detected_face["bbox"][1]),
            }
            
            iou = calculate_iou(bbox, detected_bbox)
            
            if iou > best_iou:
                best_iou = iou
                best_match = detected_face
        
        if not best_match or best_iou < 0.3:
            return {"success": False, "error": f"No matching face (best IoU: {best_iou:.2f})"}
        
        # Save descriptor
        embedding = best_match["embedding"].tolist()
        
        supabase_client_instance.client.table("photo_faces").update({
            "insightface_descriptor": embedding,
            "insightface_confidence": float(best_match["det_score"]),
        }).eq("id", face_id).execute()
        
        logger.info(f"[RegenerateDescriptors] ✓ Regenerated {face_id} (IoU: {best_iou:.2f})")
        
        return {
            "success": True,
            "iou": round(best_iou, 2),
            "det_score": round(float(best_match["det_score"]), 2)
        }
        
    except Exception as e:
        logger.error(f"[RegenerateDescriptors] Error: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/regenerate-unknown-descriptors")
async def regenerate_unknown_descriptors(gallery_id: str = Query(...), face_service: FaceRecognitionService = Depends(lambda: face_service_instance)):
    """
    Regenerate insightface_descriptor for unknown faces that don't have one.
    This fixes faces that were saved without descriptors during batch recognition.
    
    Returns statistics about regeneration process.
    """
    try:
        logger.info(f"[v3.24] ===== REGENERATE UNKNOWN DESCRIPTORS =====")
        logger.info(f"[v3.24] Gallery ID: {gallery_id}")
        
        # Get all photo_ids from gallery
        gallery_photos_response = supabase_client_instance.client.table("gallery_images").select(
            "id"
        ).eq("gallery_id", gallery_id).execute()
        
        if not gallery_photos_response.data:
            logger.info(f"[v3.24] No photos found in gallery")
            return {
                "success": True,
                "total_faces": 0,
                "regenerated": 0,
                "failed": 0,
                "already_had_descriptor": 0
            }
        
        photo_ids = [photo["id"] for photo in gallery_photos_response.data]
        logger.info(f"[v3.24] Found {len(photo_ids)} photos in gallery")
        
        # Get faces without descriptors (person_id = NULL AND insightface_descriptor IS NULL)
        faces_response = supabase_client_instance.client.table("photo_faces").select(
            "id, photo_id, insightface_bbox, insightface_descriptor, "
            "gallery_images(id, image_url, width, height)"
        ).in_("photo_id", photo_ids).is_("person_id", "null").execute()
        
        if not faces_response.data:
            logger.info(f"[v3.24] No unknown faces found")
            return {
                "success": True,
                "total_faces": 0,
                "regenerated": 0,
                "failed": 0,
                "already_had_descriptor": 0
            }
        
        total_faces = len(faces_response.data)
        regenerated = 0
        failed = 0
        already_had_descriptor = 0
        
        logger.info(f"[v3.24] Found {total_faces} unknown faces, checking descriptors...")
        
        for face in faces_response.data:
            face_id = face["id"]
            photo_data = face.get("gallery_images")
            
            if not photo_data:
                logger.warning(f"[v3.24] Face {face_id} has no photo data, skipping")
                failed += 1
                continue
            
            # Check if already has descriptor
            if face.get("insightface_descriptor"):
                already_had_descriptor += 1
                continue
            
            # Check if has bbox
            bbox = face.get("insightface_bbox")
            if not bbox:
                logger.warning(f"[v3.24] Face {face_id} has no bbox, skipping")
                failed += 1
                continue
            
            try:
                logger.info(f"[v3.24] Regenerating descriptor for face {face_id}")
                
                # Download and detect faces on image
                image_url = photo_data["image_url"]
                detected_faces = await face_service.detect_faces(image_url)
                
                if not detected_faces:
                    logger.warning(f"[v3.24] No faces detected on image for face {face_id}")
                    failed += 1
                    continue
                
                # Find matching face by IoU with stored bbox
                best_match = None
                best_iou = 0.0
                
                for detected_face in detected_faces:
                    detected_bbox = {
                        "x": float(detected_face["bbox"][0]),
                        "y": float(detected_face["bbox"][1]),
                        "width": float(detected_face["bbox"][2] - detected_face["bbox"][0]),
                        "height": float(detected_face["bbox"][3] - detected_face["bbox"][1]),
                    }
                    
                    iou = calculate_iou(bbox, detected_bbox)
                    
                    if iou > best_iou:
                        best_iou = iou
                        best_match = detected_face
                
                if best_match and best_iou > 0.3:  # 30% overlap threshold
                    # Extract descriptor
                    descriptor = best_match["embedding"]
                    
                    if len(descriptor) != 512:
                        logger.error(f"[v3.24] Invalid descriptor dimension: {len(descriptor)}, expected 512")
                        failed += 1
                        continue
                    
                    descriptor_str = f"[{','.join(map(str, descriptor))}]"
                    
                    # Update in database
                    supabase_client_instance.client.table("photo_faces").update({
                        "insightface_descriptor": descriptor_str,
                        "insightface_confidence": float(best_match["det_score"])
                    }).eq("id", face_id).execute()
                    
                    regenerated += 1
                    logger.info(f"[v3.24] ✓ Descriptor regenerated for face {face_id} (IoU: {best_iou:.2f})")
                else:
                    logger.warning(f"[v3.24] No matching face found for face {face_id} (best IoU: {best_iou:.2f})")
                    failed += 1
                    
            except Exception as e:
                logger.error(f"[v3.24] Error regenerating descriptor for face {face_id}: {str(e)}")
                failed += 1
                continue
        
        logger.info(f"[v3.24] ===== REGENERATION COMPLETE =====")
        logger.info(f"[v3.24] Total faces: {total_faces}")
        logger.info(f"[v3.24] Already had descriptor: {already_had_descriptor}")
        logger.info(f"[v3.24] Regenerated: {regenerated}")
        logger.info(f"[v3.24] Failed: {failed}")
        
        return {
            "success": True,
            "total_faces": total_faces,
            "regenerated": regenerated,
            "failed": failed,
            "already_had_descriptor": already_had_descriptor
        }
        
    except Exception as e:
        logger.error(f"[v3.24] ERROR regenerating descriptors: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-photo", response_model=ProcessPhotoResponse)
async def process_photo(
    request: ProcessPhotoRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_client: SupabaseClient = Depends(lambda: supabase_client_instance)
):
    """
    Process photo for face detection and recognition
    
    FLOW:
    1. Check if faces exist in DB
    2. If force_redetect=True → DELETE all + redetect
    3. If no faces → detect + recognize + SAVE
    4. If faces exist → recognize unassigned + UPDATE
    5. Return all faces (WITHOUT embeddings)
    """
    try:
        config = await supabase_client.get_recognition_config()
        quality_filters_config = config.get('quality_filters', {})
        
        if request.apply_quality_filters:
            face_service.quality_filters = {
                "min_detection_score": request.min_detection_score or quality_filters_config.get('min_detection_score', 0.7),
                "min_face_size": request.min_face_size or quality_filters_config.get('min_face_size', 80),
                "min_blur_score": request.min_blur_score or quality_filters_config.get('min_blur_score', 100)
            }
            logger.info(f"[v2.4.1] Quality filters: det={face_service.quality_filters['min_detection_score']}, size={face_service.quality_filters['min_face_size']}, blur={face_service.quality_filters['min_blur_score']}")
        else:
            logger.info(f"[v2.4.1] Quality filters DISABLED - all faces will be detected")
        
        logger.info("=" * 80)
        logger.info("[v2.3] ===== PROCESS PHOTO REQUEST START =====")
        logger.info(f"[v2.3] Photo ID: {request.photo_id}")
        logger.info(f"[v2.3] Force redetect: {request.force_redetect}")
        logger.info(f"[v2.3] Apply quality filters: {request.apply_quality_filters}")
        logger.info(f"[v2.3] Quality params received:")
        logger.info(f"[v2.3]   - confidence_threshold: {request.confidence_threshold}")
        logger.info(f"[v2.3]   - min_detection_score: {request.min_detection_score}")
        logger.info(f"[v2.3]   - min_face_size: {request.min_face_size}")
        logger.info(f"[v2.3]   - min_blur_score: {request.min_blur_score}")
        
        if request.force_redetect:
            logger.info("[v2.3] Force redetect requested - deleting existing faces")
            supabase_client.client.table("photo_faces").delete().eq("photo_id", request.photo_id).execute()
            logger.info("[v2.3] ✓ Existing faces deleted")
        
        # Check existing faces in database
        existing_result = supabase_client.client.table("photo_faces").select(
            "id, person_id, recognition_confidence, verified, insightface_bbox, insightface_confidence, insightface_descriptor"
        ).eq("photo_id", request.photo_id).execute()
        
        existing_faces = existing_result.data or []
        logger.info(f"[v2.3] Found {len(existing_faces)} existing faces in DB")
        
        if len(existing_faces) == 0:
            logger.info("[v2.3] Case 1: New photo - detecting faces")
            
            # Get image URL
            photo_response = supabase_client.client.table("gallery_images").select("image_url").eq("id", request.photo_id).execute()
            if not photo_response.data or len(photo_response.data) == 0:
                raise HTTPException(status_code=404, detail="Photo not found")
            
            image_url = photo_response.data[0]["image_url"]
            logger.info(f"[v2.3] Image URL: {image_url}")
            
            # Detect faces
            detected_faces = await face_service.detect_faces(image_url, apply_quality_filters=request.apply_quality_filters)
            logger.info(f"[v2.3] ✓ Detected {len(detected_faces)} faces")
            
            saved_faces = []
            
            for idx, face in enumerate(detected_faces):
                logger.info(f"[v2.3] Processing face {idx + 1}/{len(detected_faces)}")
                
                embedding = face["embedding"]
                bbox = {
                    "x": float(face["bbox"][0]),
                    "y": float(face["bbox"][1]),
                    "width": float(face["bbox"][2] - face["bbox"][0]),
                    "height": float(face["bbox"][3] - face["bbox"][1]),
                }
                det_confidence = float(face["det_score"])
                
                # Recognize
                person_id, rec_confidence = await face_service.recognize_face(embedding, confidence_threshold=request.confidence_threshold or 0.60)
                
                if rec_confidence and rec_confidence < (request.confidence_threshold or 0.60):
                    person_id = None
                    logger.info(f"[v2.4.1]   Filtered by confidence: {rec_confidence:.2f} < {request.confidence_threshold or 0.60}")
                
                logger.info(f"[v2.3]   Recognition: person_id={person_id}, confidence={rec_confidence}")
                
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
                    logger.info(f"[v2.3]   ✓ Saved with ID: {saved_face['id']}")
                    saved_faces.append(saved_face)
                else:
                    logger.error(f"[v2.3]   ❌ Failed to save face")
            
            logger.info(f"[v2.3] ✓ Saved {len(saved_faces)} faces to database")
            
            # Load people info
            response_faces = []
            for face in saved_faces:
                if face["person_id"]:
                    person_response = supabase_client.client.table("people").select("id, real_name, telegram_name").eq("id", face["person_id"]).execute()
                    person_data = person_response.data[0] if person_response.data else None
                else:
                    person_data = None
                
                response_faces.append({
                    "id": face["id"],
                    "person_id": face["person_id"],
                    "recognition_confidence": face["recognition_confidence"],
                    "verified": face["verified"],
                    "insightface_bbox": face["insightface_bbox"],
                    "insightface_confidence": face["insightface_confidence"],
                    "people": person_data,
                })
            
            logger.info("[v2.3] ===== PROCESS PHOTO REQUEST END =====")
            logger.info("=" * 80)
            
            return {"success": True, "data": response_faces, "error": None}
        
        logger.info(f"[v2.3] Case 2: Existing faces - checking for unverified")
        
        unverified_faces = [f for f in existing_faces if not f["person_id"] or not f["verified"]]
        logger.info(f"[v2.3] Found {len(unverified_faces)} unverified faces")
        
        if len(unverified_faces) > 0:
            logger.info(f"[v2.3] Recognizing {len(unverified_faces)} unverified faces")
            
            for face in unverified_faces:
                # Read embedding from DB
                descriptor = face["insightface_descriptor"]
                if not descriptor:
                    logger.warning(f"[v2.3] Face {face['id']} has no descriptor - skipping")
                    continue
                
                if isinstance(descriptor, str):
                    import json
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)
                elif isinstance(descriptor, list):
                    embedding = np.array(descriptor, dtype=np.float32)
                else:
                    logger.warning(f"[v2.3] Unknown descriptor type: {type(descriptor)}")
                    continue
                
                # Recognize
                person_id, rec_confidence = await face_service.recognize_face(embedding, confidence_threshold=request.confidence_threshold or 0.60)
                
                if rec_confidence and rec_confidence < (request.confidence_threshold or 0.60):
                    person_id = None
                    logger.info(f"[v2.4.1]   Filtered by confidence: {rec_confidence:.2f} < {request.confidence_threshold or 0.60}")
                
                if person_id and rec_confidence:
                    logger.info(f"[v2.3]   Face {face['id']}: person_id={person_id}, confidence={rec_confidence}")
                    
                    # UPDATE database
                    supabase_client.client.table("photo_faces").update({
                        "person_id": person_id,
                        "recognition_confidence": rec_confidence,
                    }).eq("id", face["id"]).execute()
                    
                    logger.info(f"[v2.3]   ✓ Updated face {face['id']}")
        
        # Load all faces (updated)
        final_result = supabase_client.client.table("photo_faces").select(
            "id, person_id, recognition_confidence, verified, insightface_bbox, insightface_confidence, people(id, real_name, telegram_name)"
        ).eq("photo_id", request.photo_id).execute()
        
        response_faces = final_result.data or []
        
        logger.info(f"[v2.3] ✓ Returning {len(response_faces)} faces")
        logger.info("[v2.3] ===== PROCESS PHOTO REQUEST END =====")
        logger.info("=" * 80)
        
        return {"success": True, "data": response_faces, "error": None}
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[v2.3] ❌ ERROR in process_photo")
        logger.error(f"[v2.3] Photo ID: {request.photo_id}")
        logger.error(f"[v2.3] Apply quality filters: {request.apply_quality_filters}")
        logger.error(f"[v2.3] Error type: {type(e).__name__}")
        logger.error(f"[v2.3] Error message: {str(e)}")
        logger.error(f"[v2.3] Full traceback:", exc_info=True)
        logger.error("=" * 80)
        
        # Сериализация ошибки для frontend
        error_message = str(e)
        if hasattr(e, '__dict__'):
            try:
                error_message = f"{type(e).__name__}: {str(e)}"
            except:
                pass
        
        return {"success": False, "data": None, "error": error_message}

def calculate_iou(box1: dict, box2: dict) -> float:
    """Calculate Intersection over Union"""
    x1 = max(box1["x"], box2["x"])
    y1 = max(box1["y"], box2["y"])
    x2 = min(box1["x"] + box1["width"], box2["x"] + box2["width"])
    y2 = min(box1["y"] + box1["height"], box2["y"] + box2["height"])
    
    if x2 < x1 or y2 < y1:
        return 0.0
    
    intersection = (x2 - x1) * (y2 - y1)
    area1 = box1["width"] * box1["height"]
    area2 = box2["width"] * box2["height"]
    union = area1 + area2 - intersection
    
    return intersection / union if union > 0 else 0.0
