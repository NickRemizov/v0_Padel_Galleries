"""
Face clustering endpoints.
- POST /cluster-unknown-faces
- POST /reject-face-cluster
"""

from fastapi import APIRouter, Query
from typing import List, Optional
import numpy as np
import hdbscan
import json

from core.config import VERSION
from core.responses import ApiResponse
from core.exceptions import ClusteringError
from core.logging import get_logger
from services.supabase import get_faces_repository, get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


@router.post("/cluster-unknown-faces")
def cluster_unknown_faces(
    gallery_id: Optional[str] = Query(None, description="ID галереи (опционально, если не указан - по всей базе)"),
    min_cluster_size: int = Query(2, description="Минимальный размер кластера"),
):
    """
    Кластеризация неизвестных лиц с HDBSCAN.
    Если gallery_id указан - только в этой галерее.
    Если gallery_id не указан - по всей базе.
    
    v1.1.0: Added distance_to_centroid for each face in cluster.
    """
    faces_repo = get_faces_repository()
    try:
        if gallery_id:
            logger.info(f"[v{VERSION}] Clustering unknown faces for gallery {gallery_id}")
            faces = faces_repo.get_unknown_faces_from_gallery(gallery_id)
        else:
            logger.info(f"[v{VERSION}] Clustering ALL unknown faces from database (global mode)")
            faces = faces_repo.get_all_unknown_faces()
        
        if not faces or len(faces) < min_cluster_size:
            logger.info(f"[v{VERSION}] Not enough faces for clustering: {len(faces) if faces else 0}")
            return ApiResponse.ok({
                "clusters": [],
                "ungrouped_faces": []
            }).model_dump()
        
        logger.info(f"[v{VERSION}] Clustering {len(faces)} faces...")
        
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
        
        logger.info(f"[v{VERSION}] Found {len(set(cluster_labels))} unique labels")
        
        # Group faces by cluster with their embeddings
        clusters_dict = {}
        ungrouped = []
        
        for idx, (face, label) in enumerate(zip(faces, cluster_labels)):
            if label == -1:
                ungrouped.append(face)
            else:
                if label not in clusters_dict:
                    clusters_dict[label] = []
                # Store face with its embedding index
                clusters_dict[label].append((face, idx))
        
        # Format clusters and sort by size (largest first)
        clusters = []
        for cluster_id, cluster_data in clusters_dict.items():
            # Calculate centroid for this cluster
            cluster_indices = [idx for _, idx in cluster_data]
            cluster_embeddings = embeddings_array[cluster_indices]
            centroid = np.mean(cluster_embeddings, axis=0)
            
            # Calculate distance to centroid for each face
            normalized_faces = []
            for face, idx in cluster_data:
                face = face.copy()
                
                # Calculate distance to centroid
                embedding = embeddings_array[idx]
                distance = float(np.linalg.norm(embedding - centroid))
                face["distance_to_centroid"] = round(distance, 4)
                
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
            
            # Sort faces by distance to centroid (closest first)
            normalized_faces.sort(key=lambda x: x.get("distance_to_centroid", float("inf")))
            
            clusters.append({
                "cluster_id": int(cluster_id),
                "size": len(normalized_faces),
                "faces": normalized_faces
            })
        
        clusters.sort(key=lambda x: x["size"], reverse=True)
        
        logger.info(f"[v{VERSION}] Returning {len(clusters)} clusters, {len(ungrouped)} ungrouped")
        
        return ApiResponse.ok({
            "clusters": clusters,
            "ungrouped_faces": ungrouped
        }).model_dump()
        
    except Exception as e:
        logger.error(f"[v{VERSION}] Error clustering faces: {str(e)}")
        raise ClusteringError(f"Failed to cluster faces: {str(e)}")


@router.post("/reject-face-cluster")
def reject_face_cluster(
    face_ids: List[str],
):
    """
    Delete a cluster of faces from photo_faces table.
    
    NOTE: rejected_faces table exists but not used yet.
    TODO: Implement spectator detection using rejected_faces in future.
    
    Args:
        face_ids: List of face IDs to delete
    """
    supabase_client = get_supabase_client()
    try:
        logger.info(f"[v{VERSION}] ===== REJECT FACE CLUSTER =====")
        logger.info(f"[v{VERSION}] Face IDs to delete: {len(face_ids)}")
        
        deleted_count = 0
        for face_id in face_ids:
            result = supabase_client.table("photo_faces").delete().eq("id", face_id).execute()
            if result.data:
                deleted_count += 1
        
        logger.info(f"[v{VERSION}] Successfully deleted {deleted_count} faces")
        
        return ApiResponse.ok({"deleted": deleted_count}).model_dump()
        
    except Exception as e:
        logger.error(f"[v{VERSION}] ERROR rejecting cluster: {str(e)}", exc_info=True)
        raise ClusteringError(f"Failed to reject face cluster: {str(e)}")
