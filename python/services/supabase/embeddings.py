"""
Supabase Embeddings Repository - HNSW index data operations.

Extracted from supabase_database.py. Handles:
- Loading embeddings for HNSW index
- Audit operations (get all embeddings for person)
- Exclusion management (outliers)

v6.0: all-faces-indexed architecture - loads ALL faces with descriptors:
- Faces without person_id are included (person_id can be None)
- excluded_from_index is returned as metadata, not filtered
- Recognition logic handles exclusion in FaceRecognitionService
"""

from typing import List, Tuple, Dict, Optional
import numpy as np
import json

from core.logging import get_logger
from .base import get_supabase_client

logger = get_logger(__name__)


class EmbeddingsRepository:
    """Repository for face embeddings (HNSW index data)."""
    
    def __init__(self):
        self._client = get_supabase_client()
    
    def get_all_player_embeddings(self) -> Tuple[List[str], List[Optional[str]], List[np.ndarray], List[bool], List[float], List[bool]]:
        """
        Load InsightFace embeddings from photo_faces table for HNSW index.

        v6.0: Loads ALL faces with descriptors:
        - Faces without person_id are included (person_id will be None)
        - excluded_from_index is returned as metadata, not filtered out
        - Recognition logic will skip faces where person_id is None OR excluded is True

        Returns:
            Tuple of (face_ids, person_ids, embeddings, verified_flags, confidences, excluded_flags)
            - person_ids can contain None for unassigned faces
        """
        logger.info("Loading ALL embeddings from Supabase (all faces indexed)...")

        try:
            all_data = []
            page_size = 1000
            offset = 0

            while True:
                # v6.0: Load ALL faces with descriptors, no filter on person_id or excluded
                response = self._client.table("photo_faces").select(
                    "id, person_id, insightface_descriptor, verified, recognition_confidence, excluded_from_index, created_at"
                ).not_.is_(
                    "insightface_descriptor", "null"
                ).order("created_at", desc=False).range(offset, offset + page_size - 1).execute()

                if not response.data:
                    break

                all_data.extend(response.data)
                logger.debug(f"Loaded page: offset={offset}, count={len(response.data)}, total={len(all_data)}")

                if len(response.data) < page_size:
                    break

                offset += page_size

            if not all_data:
                logger.warning("No embeddings found in database")
                return [], [], [], [], [], []

            # Process results
            face_ids = []
            person_ids = []
            embeddings = []
            verified_flags = []
            confidences = []
            excluded_flags = []
            skipped = 0

            for row in all_data:
                descriptor = row["insightface_descriptor"]
                verified = row.get("verified", False) or False
                excluded = row.get("excluded_from_index", False) or False
                person_id = row.get("person_id")  # Can be None

                # Verified faces ALWAYS have confidence 1.0 (source is trusted)
                # Faces without person_id have confidence 0.0
                if verified:
                    confidence = 1.0
                elif person_id:
                    confidence = row.get("recognition_confidence") or 0.0
                else:
                    confidence = 0.0

                # Convert descriptor
                if isinstance(descriptor, list):
                    embedding = np.array(descriptor, dtype=np.float32)
                elif isinstance(descriptor, str):
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)
                else:
                    skipped += 1
                    continue

                # Validate dimension
                if len(embedding) != 512:
                    skipped += 1
                    continue

                face_ids.append(str(row["id"]))
                person_ids.append(person_id)  # Keep as None if NULL
                embeddings.append(embedding)
                verified_flags.append(verified)
                confidences.append(float(confidence))
                excluded_flags.append(excluded)

            # Statistics
            with_person = sum(1 for p in person_ids if p is not None)
            verified_count = sum(verified_flags)
            excluded_count = sum(excluded_flags)
            unique_people = len(set(p for p in person_ids if p is not None))

            logger.info(f"Loaded {len(embeddings)} embeddings: {with_person} with person_id, "
                       f"{verified_count} verified, {excluded_count} excluded, {unique_people} unique people")

            if skipped > 0:
                logger.warning(f"Skipped {skipped} invalid embeddings")

            return face_ids, person_ids, embeddings, verified_flags, confidences, excluded_flags

        except Exception as e:
            logger.error(f"Error loading embeddings: {e}", exc_info=True)
            return [], [], [], [], [], []
    
    def get_person_embeddings_for_audit(self, person_id: str) -> List[Dict]:
        """
        Get ALL embeddings for a person (including excluded) for audit.
        
        Returns:
            List of dicts with id, insightface_descriptor, excluded_from_index,
            recognition_confidence, verified
        """
        logger.info(f"Getting all embeddings for person {person_id}...")
        
        try:
            response = self._client.table("photo_faces").select(
                "id, insightface_descriptor, excluded_from_index, recognition_confidence, verified"
            ).eq(
                "person_id", person_id
            ).not_.is_(
                "insightface_descriptor", "null"
            ).execute()
            
            result = response.data or []
            logger.info(f"Found {len(result)} embeddings for person")
            return result
            
        except Exception as e:
            logger.error(f"Error getting person embeddings: {e}")
            return []
    
    def get_face_embeddings_by_ids(self, face_ids: List[str]) -> List[Dict]:
        """
        Get face embeddings by face IDs for incremental index operations.

        Args:
            face_ids: List of photo_faces IDs

        Returns:
            List of dicts with id, person_id, insightface_descriptor, verified, recognition_confidence
        """
        if not face_ids:
            return []

        logger.info(f"Getting embeddings for {len(face_ids)} faces...")

        try:
            # Batch fetch in chunks of 100
            all_results = []
            batch_size = 100

            for i in range(0, len(face_ids), batch_size):
                batch = face_ids[i:i + batch_size]
                response = self._client.table("photo_faces").select(
                    "id, person_id, insightface_descriptor, verified, recognition_confidence, excluded_from_index"
                ).in_("id", batch).execute()

                if response.data:
                    all_results.extend(response.data)

            logger.info(f"Found {len(all_results)} embeddings")
            return all_results

        except Exception as e:
            logger.error(f"Error getting face embeddings: {e}")
            return []

    def set_excluded_from_index(self, face_ids: List[str], excluded: bool = True) -> int:
        """
        Set excluded_from_index flag for multiple faces.

        Args:
            face_ids: List of photo_faces IDs to update
            excluded: True to exclude, False to include

        Returns:
            Number of faces updated
        """
        if not face_ids:
            return 0

        logger.info(f"Setting excluded_from_index={excluded} for {len(face_ids)} faces...")
        
        try:
            batch_size = 100
            updated = 0
            
            for i in range(0, len(face_ids), batch_size):
                batch = face_ids[i:i + batch_size]
                
                response = self._client.table("photo_faces").update({
                    "excluded_from_index": excluded
                }).in_("id", batch).execute()
                
                if response.data:
                    updated += len(response.data)
            
            logger.info(f"Updated {updated} faces")
            return updated
            
        except Exception as e:
            logger.error(f"Error setting excluded_from_index: {e}")
            return 0
    
    def get_excluded_stats_by_person(self) -> List[Dict]:
        """
        Get exclusion statistics grouped by person.
        
        Returns:
            List of dicts with person_id, name, total_count, excluded_count
        """
        logger.info("Getting excluded stats by person...")
        
        try:
            # Try RPC first
            try:
                response = self._client.rpc("get_excluded_stats_by_person").execute()
                if response.data:
                    return response.data
            except:
                pass
            
            # Fallback: manual aggregation with pagination
            all_faces = []
            page_size = 1000
            offset = 0

            while True:
                faces_response = self._client.table("photo_faces").select(
                    "person_id, excluded_from_index"
                ).not_.is_(
                    "person_id", "null"
                ).not_.is_(
                    "insightface_descriptor", "null"
                ).range(offset, offset + page_size - 1).execute()

                if not faces_response.data:
                    break

                all_faces.extend(faces_response.data)

                if len(faces_response.data) < page_size:
                    break

                offset += page_size

            if not all_faces:
                return []

            # Aggregate
            stats = {}
            for face in all_faces:
                pid = face["person_id"]
                if pid not in stats:
                    stats[pid] = {"total": 0, "excluded": 0}
                stats[pid]["total"] += 1
                if face.get("excluded_from_index"):
                    stats[pid]["excluded"] += 1
            
            # Get person names
            person_ids = list(stats.keys())
            people_response = self._client.table("people").select(
                "id, real_name"
            ).in_("id", person_ids).execute()
            
            names = {p["id"]: p.get("real_name", "Unknown") for p in (people_response.data or [])}
            
            # Build result (only people with excluded faces)
            result = []
            for pid, counts in stats.items():
                if counts["excluded"] > 0:
                    result.append({
                        "person_id": pid,
                        "name": names.get(pid, "Unknown"),
                        "total_count": counts["total"],
                        "excluded_count": counts["excluded"]
                    })
            
            return sorted(result, key=lambda x: x["excluded_count"], reverse=True)
            
        except Exception as e:
            logger.error(f"Error getting excluded stats: {e}")
            return []


# Module-level instance
_embeddings_repo: EmbeddingsRepository = None


def get_embeddings_repository() -> EmbeddingsRepository:
    """Get EmbeddingsRepository singleton."""
    global _embeddings_repo
    if _embeddings_repo is None:
        _embeddings_repo = EmbeddingsRepository()
    return _embeddings_repo
