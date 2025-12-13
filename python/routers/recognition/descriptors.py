"""
Descriptor generation and regeneration endpoints.
- POST /generate-descriptors
- GET /missing-descriptors-count
- GET /missing-descriptors-list
- POST /regenerate-missing-descriptors
- POST /regenerate-single-descriptor
- POST /regenerate-unknown-descriptors
"""

from fastapi import APIRouter, HTTPException, Query, Depends
import logging
import numpy as np

from models.recognition_schemas import GenerateDescriptorsRequest
from utils.geometry import calculate_iou
from .dependencies import face_service_instance, supabase_client_instance

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/generate-descriptors")
async def generate_descriptors(
    request: GenerateDescriptorsRequest,
    face_service=Depends(lambda: face_service_instance)
):
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
    face_service=Depends(lambda: face_service_instance)
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
    face_service=Depends(lambda: face_service_instance)
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
async def regenerate_unknown_descriptors(
    gallery_id: str = Query(...),
    face_service=Depends(lambda: face_service_instance)
):
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
