"""
Face clustering endpoints.
- POST /cluster-unknown-faces
- POST /reject-face-cluster
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
import logging
import numpy as np
import hdbscan
import json

from .dependencies import get_face_service, get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/cluster-unknown-faces")
async def cluster_unknown_faces(
    gallery_id: str = Query(..., description="ID галереи"),
    min_cluster_size: int = Query(2, description="Минимальный размер кластера"),
):
    """
    Кластеризация неизвестных лиц в галерее с HDBSCAN
    """
    supabase_client = get_supabase_client()
    try:
        logger.info(f"Clustering unknown faces for gallery {gallery_id}")
        
        # Get unknown faces
        faces = await supabase_client.get_unknown_faces_from_gallery(gallery_id)
        
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
        
        logger.info(f"Returning {len(clusters)} clusters, {len(ungrouped)} ungrouped")
        
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
    face_service=Depends(get_face_service)
):
    """
    Reject a cluster of faces as not interesting
    """
    supabase_client = get_supabase_client()
    try:
        logger.info(f"[v3.23] ===== REJECT FACE CLUSTER =====")
        logger.info(f"[v3.23] Gallery ID: {gallery_id}")
        logger.info(f"[v3.23] Face IDs: {len(face_ids)}")
        logger.info(f"[v3.23] Rejected by: {rejected_by}")
        
        # Get face descriptors
        descriptors = []
        photo_ids = []
        
        for face_id in face_ids:
            response = supabase_client.client.table("photo_faces").select(
                "photo_id, insightface_descriptor"
            ).eq("id", face_id).execute()
            
            if response.data and len(response.data) > 0:
                face = response.data[0]
                descriptor = face["insightface_descriptor"]
                
                if isinstance(descriptor, list):
                    descriptors.append(np.array(descriptor, dtype=np.float32))
                elif isinstance(descriptor, str):
                    descriptors.append(np.array(json.loads(descriptor), dtype=np.float32))
                
                photo_ids.append(face["photo_id"])
        
        # Save to rejected_faces table
        success = await supabase_client.reject_face_cluster(
            descriptors=descriptors,
            gallery_id=gallery_id,
            photo_ids=photo_ids,
            rejected_by=rejected_by,
            reason=reason
        )
        
        if success:
            # Delete the photo_faces records
            for face_id in face_ids:
                supabase_client.client.table("photo_faces").delete().eq("id", face_id).execute()
            
            logger.info(f"[v3.23] Successfully rejected and deleted {len(face_ids)} faces")
        
        return {"success": success}
        
    except Exception as e:
        logger.error(f"[v3.23] ERROR rejecting cluster: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
