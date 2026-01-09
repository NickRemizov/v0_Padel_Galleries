"""
Descriptor Regeneration Endpoints

Endpoints:
- POST /regenerate-missing-descriptors
- POST /regenerate-single-descriptor
- POST /regenerate-unknown-descriptors
"""

from fastapi import APIRouter, Query, Depends

from core.config import VERSION
from core.responses import ApiResponse
from core.exceptions import DescriptorError, FaceNotFoundError
from core.logging import get_logger
from utils.geometry import calculate_iou

from ..dependencies import get_face_service, get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


@router.post("/regenerate-missing-descriptors")
async def regenerate_missing_descriptors(
    face_service=Depends(get_face_service)
):
    """
    Regenerate insightface_descriptor for faces that were manually assigned to people.
    Uses IoU matching to find the corresponding detected face.
    """
    supabase_client = get_supabase_client()
    try:
        logger.info(f"[v{VERSION}] ===== REGENERATE MISSING DESCRIPTORS =====")
        
        # Get faces with person_id but no descriptor
        missing_result = supabase_client.client.table("photo_faces").select(
            "id, photo_id, person_id, insightface_bbox, people(real_name), gallery_images(image_url)"
        ).not_.is_("person_id", "null").is_("insightface_descriptor", "null").execute()
        
        missing_faces = missing_result.data or []
        logger.info(f"[v{VERSION}] Found {len(missing_faces)} faces to regenerate")
        
        if not missing_faces:
            return ApiResponse.ok({
                "total_faces": 0,
                "regenerated": 0,
                "failed": 0,
                "details": []
            }).model_dump()
        
        regenerated = 0
        failed = 0
        details = []
        regenerated_face_ids = []  # Track for index sync

        # Group by photo_id for efficient processing
        faces_by_photo = {}
        for face in missing_faces:
            photo_id = face["photo_id"]
            if photo_id not in faces_by_photo:
                faces_by_photo[photo_id] = []
            faces_by_photo[photo_id].append(face)
        
        logger.info(f"[v{VERSION}] Processing {len(faces_by_photo)} unique photos")
        
        for photo_id, photo_faces in faces_by_photo.items():
            try:
                image_url = photo_faces[0].get("gallery_images", {}).get("image_url")
                if not image_url:
                    for face in photo_faces:
                        failed += 1
                        details.append({"face_id": face["id"], "status": "error", "error": "No image URL"})
                    continue
                
                detected_faces = await face_service.detect_faces(image_url, apply_quality_filters=False)
                
                for missing_face in photo_faces:
                    try:
                        manual_bbox = missing_face.get("insightface_bbox")
                        if not manual_bbox:
                            failed += 1
                            details.append({"face_id": missing_face["id"], "status": "error", "error": "No bbox"})
                            continue
                        
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
                        
                        if best_match and best_iou > 0.5:
                            embedding = best_match["embedding"].tolist()
                            supabase_client.client.table("photo_faces").update({
                                "insightface_descriptor": embedding,
                                "insightface_det_score": float(best_match["det_score"]),
                            }).eq("id", missing_face["id"]).execute()

                            regenerated += 1
                            regenerated_face_ids.append(missing_face["id"])
                            details.append({"face_id": missing_face["id"], "status": "success", "iou": round(best_iou, 3)})
                            logger.info(f"[v{VERSION}] ✓ Regenerated {missing_face['id']} (IoU: {best_iou:.3f})")
                        else:
                            failed += 1
                            details.append({"face_id": missing_face["id"], "status": "error", "error": f"No match (IoU: {best_iou:.3f})"})
                    
                    except Exception as face_error:
                        failed += 1
                        details.append({"face_id": missing_face["id"], "status": "error", "error": str(face_error)})
            
            except Exception as photo_error:
                for face in photo_faces:
                    failed += 1
                    details.append({"face_id": face["id"], "status": "error", "error": str(photo_error)})
        
        logger.info(f"[v{VERSION}] ===== END ===== Total: {len(missing_faces)}, Success: {regenerated}, Failed: {failed}")

        # Sync index - add regenerated faces (they all have person_id)
        index_rebuilt = False
        if regenerated_face_ids:
            try:
                idx_result = await face_service.add_faces_to_index(regenerated_face_ids)
                logger.info(f"[v{VERSION}] Index sync: {idx_result}")
                index_rebuilt = idx_result.get("rebuild_triggered", False)
            except Exception as idx_err:
                logger.error(f"[v{VERSION}] Failed to add regenerated faces to index: {idx_err}")

        return ApiResponse.ok({
            "total_faces": len(missing_faces),
            "regenerated": regenerated,
            "failed": failed,
            "details": details,
            "index_rebuilt": index_rebuilt
        }).model_dump()
    
    except Exception as e:
        logger.error(f"[v{VERSION}] Fatal error: {str(e)}", exc_info=True)
        raise DescriptorError(f"Failed to regenerate descriptors: {str(e)}")


@router.post("/regenerate-single-descriptor")
async def regenerate_single_descriptor(
    face_id: str = Query(...),
    face_service=Depends(get_face_service)
):
    """Regenerate descriptor for a single face"""
    supabase_client = get_supabase_client()
    try:
        face_result = supabase_client.client.table("photo_faces").select(
            "id, photo_id, person_id, insightface_bbox, gallery_images(image_url)"
        ).eq("id", face_id).execute()
        
        if not face_result.data:
            raise FaceNotFoundError(face_id)
        
        face = face_result.data[0]
        image_url = face.get("gallery_images", {}).get("image_url") if face.get("gallery_images") else None
        
        if not image_url:
            return ApiResponse.fail("No image URL", code="NO_IMAGE").model_dump()
        
        bbox = face.get("insightface_bbox")
        if not bbox:
            return ApiResponse.fail("No bbox stored", code="NO_BBOX").model_dump()
        
        detected_faces = await face_service.detect_faces(image_url, apply_quality_filters=False)
        
        if not detected_faces:
            return ApiResponse.fail("No faces detected on image", code="NO_FACES").model_dump()
        
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
            return ApiResponse.fail(f"No matching face (best IoU: {best_iou:.2f})", code="NO_MATCH").model_dump()
        
        embedding = best_match["embedding"].tolist()
        supabase_client.client.table("photo_faces").update({
            "insightface_descriptor": embedding,
            "insightface_det_score": float(best_match["det_score"]),
        }).eq("id", face_id).execute()

        logger.info(f"[v{VERSION}] ✓ Regenerated {face_id} (IoU: {best_iou:.2f})")

        # Sync index - add to index if has person_id
        index_rebuilt = False
        if face.get("person_id"):
            try:
                idx_result = await face_service.add_face_to_index(face_id, face["person_id"])
                logger.info(f"[v{VERSION}] Index sync: {idx_result}")
                index_rebuilt = idx_result.get("rebuild_triggered", False)
            except Exception as idx_err:
                logger.error(f"[v{VERSION}] Failed to add to index: {idx_err}")

        return ApiResponse.ok({
            "iou": round(best_iou, 2),
            "index_rebuilt": index_rebuilt,
            "det_score": round(float(best_match["det_score"]), 2)
        }).model_dump()
        
    except FaceNotFoundError:
        raise
    except Exception as e:
        logger.error(f"[v{VERSION}] Error: {str(e)}", exc_info=True)
        raise DescriptorError(f"Failed to regenerate descriptor: {str(e)}")


@router.post("/regenerate-unknown-descriptors")
async def regenerate_unknown_descriptors(
    gallery_id: str = Query(...),
    face_service=Depends(get_face_service)
):
    """
    Regenerate insightface_descriptor for unknown faces that don't have one.
    This fixes faces that were saved without descriptors during batch recognition.
    """
    supabase_client = get_supabase_client()
    try:
        logger.info(f"[v{VERSION}] ===== REGENERATE UNKNOWN DESCRIPTORS =====")
        logger.info(f"[v{VERSION}] Gallery ID: {gallery_id}")
        
        gallery_photos_response = supabase_client.client.table("gallery_images").select("id").eq("gallery_id", gallery_id).execute()
        
        if not gallery_photos_response.data:
            logger.info(f"[v{VERSION}] No photos found in gallery")
            return ApiResponse.ok({"total_faces": 0, "regenerated": 0, "failed": 0, "already_had_descriptor": 0}).model_dump()
        
        photo_ids = [photo["id"] for photo in gallery_photos_response.data]
        logger.info(f"[v{VERSION}] Found {len(photo_ids)} photos in gallery")
        
        faces_response = supabase_client.client.table("photo_faces").select(
            "id, photo_id, insightface_bbox, insightface_descriptor, gallery_images(id, image_url)"
        ).in_("photo_id", photo_ids).is_("person_id", "null").execute()
        
        if not faces_response.data:
            logger.info(f"[v{VERSION}] No unknown faces found")
            return ApiResponse.ok({"total_faces": 0, "regenerated": 0, "failed": 0, "already_had_descriptor": 0}).model_dump()
        
        total_faces = len(faces_response.data)
        regenerated = 0
        failed = 0
        already_had_descriptor = 0
        
        logger.info(f"[v{VERSION}] Found {total_faces} unknown faces, checking descriptors...")
        
        for face in faces_response.data:
            face_id = face["id"]
            photo_data = face.get("gallery_images")
            
            if not photo_data:
                failed += 1
                continue
            
            if face.get("insightface_descriptor"):
                already_had_descriptor += 1
                continue
            
            bbox = face.get("insightface_bbox")
            if not bbox:
                failed += 1
                continue
            
            try:
                image_url = photo_data["image_url"]
                detected_faces = await face_service.detect_faces(image_url)
                
                if not detected_faces:
                    failed += 1
                    continue
                
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
                
                if best_match and best_iou > 0.3:
                    descriptor = best_match["embedding"]
                    if len(descriptor) != 512:
                        failed += 1
                        continue
                    
                    descriptor_str = f"[{','.join(map(str, descriptor))}]"
                    supabase_client.client.table("photo_faces").update({
                        "insightface_descriptor": descriptor_str,
                        "insightface_det_score": float(best_match["det_score"])
                    }).eq("id", face_id).execute()
                    
                    regenerated += 1
                    logger.info(f"[v{VERSION}] ✓ Regenerated {face_id} (IoU: {best_iou:.2f})")
                else:
                    failed += 1
                    
            except Exception as e:
                logger.error(f"[v{VERSION}] Error regenerating {face_id}: {str(e)}")
                failed += 1
        
        logger.info(f"[v{VERSION}] ===== REGENERATION COMPLETE =====")
        logger.info(f"[v{VERSION}] Total: {total_faces}, Already had: {already_had_descriptor}, Regenerated: {regenerated}, Failed: {failed}")
        
        return ApiResponse.ok({
            "total_faces": total_faces,
            "regenerated": regenerated,
            "failed": failed,
            "already_had_descriptor": already_had_descriptor
        }).model_dump()
        
    except Exception as e:
        logger.error(f"[v{VERSION}] ERROR: {str(e)}")
        raise DescriptorError(f"Failed to regenerate unknown descriptors: {str(e)}")
