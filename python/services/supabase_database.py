import os
import numpy as np
from typing import List, Tuple, Optional, Dict
from supabase import create_client, Client
import json


class SupabaseDatabase:
    """Database service for loading embeddings from Supabase PostgreSQL"""
    
    def __init__(self):
        """Initialize Supabase client"""
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self.client: Client = create_client(supabase_url, supabase_key)
        print("[v3.0] SupabaseDatabase initialized")
    
    def get_all_player_embeddings(self) -> Tuple[List[str], List[np.ndarray], List[bool], List[float]]:
        """
        Load InsightFace embeddings from photo_faces table for HNSW index.
        Only loads embeddings where excluded_from_index = FALSE.
        
        Returns:
            Tuple of (person_ids, embeddings, verified_flags, confidences) where:
            - person_ids: List of person IDs (one per embedding)
            - embeddings: List of 512-dim numpy arrays
            - verified_flags: List of booleans (True if verified)
            - confidences: List of recognition_confidence values (1.0 for verified)
        """
        print("[v3.0] Loading embeddings from Supabase (excluded_from_index=FALSE)...")
        
        try:
            all_data = []
            page_size = 1000  # Supabase default limit
            offset = 0
            
            while True:
                # Query photo_faces table with pagination
                # Filter: excluded_from_index = FALSE (only include valid descriptors)
                response = self.client.table("photo_faces").select(
                    "id, person_id, insightface_descriptor, verified, recognition_confidence, created_at"
                ).not_.is_(
                    "insightface_descriptor", "null"
                ).not_.is_(
                    "person_id", "null"
                ).eq(
                    "excluded_from_index", False
                ).order("created_at", desc=False).range(offset, offset + page_size - 1).execute()
                
                if not response.data or len(response.data) == 0:
                    break  # No more data
                
                all_data.extend(response.data)
                print(f"[v3.0] Loaded page: offset={offset}, count={len(response.data)}, total so far={len(all_data)}")
                
                # If we got less than page_size, we've reached the end
                if len(response.data) < page_size:
                    break
                
                offset += page_size
            
            if not all_data:
                print("[v3.0] No embeddings found in database")
                return [], [], [], []
            
            total_rows = len(all_data)
            verified_count = sum(1 for row in all_data if row.get("verified"))
            non_verified_count = total_rows - verified_count
            print(f"[v3.0] ✓ Loaded {total_rows} faces ({verified_count} verified, {non_verified_count} non-verified)")
            
            person_ids = []
            embeddings = []
            verified_flags = []
            confidences = []
            skipped_count = 0
            
            person_id_counts = {}
            
            for row in all_data:
                face_id = row["id"]
                person_id = row["person_id"]
                descriptor = row["insightface_descriptor"]
                verified = row.get("verified", False) or False
                confidence = row.get("recognition_confidence") or (1.0 if verified else 0.0)
                
                person_id_counts[person_id] = person_id_counts.get(person_id, 0) + 1
                
                # Convert descriptor to numpy array
                if isinstance(descriptor, list):
                    embedding = np.array(descriptor, dtype=np.float32)
                elif isinstance(descriptor, str):
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)
                else:
                    print(f"[v3.0] WARNING: Unknown descriptor type for face_id={face_id}: {type(descriptor)}")
                    skipped_count += 1
                    continue
                
                # Validate embedding dimension
                if len(embedding) != 512:
                    print(f"[v3.0] WARNING: Invalid embedding dimension {len(embedding)} for face_id={face_id}, expected 512")
                    skipped_count += 1
                    continue
                
                person_ids.append(str(person_id))
                embeddings.append(embedding)
                verified_flags.append(verified)
                confidences.append(float(confidence))
            
            unique_people = len(set(person_ids))
            print(f"[v3.0] ✓ Loaded {len(embeddings)} valid embeddings for {unique_people} unique people")
            if skipped_count > 0:
                print(f"[v3.0] Skipped {skipped_count} invalid embeddings")
            
            top_people = sorted(person_id_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            print(f"[v3.0] Top 5 people by descriptor count: {top_people}")
            
            return person_ids, embeddings, verified_flags, confidences
            
        except Exception as e:
            print(f"[v3.0] ERROR loading embeddings from Supabase: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"[v3.0] Traceback:\n{traceback.format_exc()}")
            return [], [], [], []
    
    def get_person_embeddings_for_audit(self, person_id: str) -> List[dict]:
        """
        Get ALL embeddings for a person (including excluded) for audit purposes.
        
        Returns:
            List of dicts with id, insightface_descriptor, excluded_from_index, 
            recognition_confidence, verified
        """
        print(f"[Audit] Getting all embeddings for person {person_id}...")
        
        try:
            response = self.client.table("photo_faces").select(
                "id, insightface_descriptor, excluded_from_index, recognition_confidence, verified"
            ).eq(
                "person_id", person_id
            ).not_.is_(
                "insightface_descriptor", "null"
            ).execute()
            
            if not response.data:
                return []
            
            print(f"[Audit] Found {len(response.data)} embeddings for person")
            return response.data
            
        except Exception as e:
            print(f"[Audit] ERROR getting person embeddings: {str(e)}")
            return []
    
    def set_excluded_from_index(self, face_ids: List[str], excluded: bool = True) -> int:
        """
        Set excluded_from_index flag for multiple faces.
        
        Args:
            face_ids: List of photo_faces IDs to update
            excluded: True to exclude from index, False to include
            
        Returns:
            Number of faces updated
        """
        if not face_ids:
            return 0
        
        print(f"[Audit] Setting excluded_from_index={excluded} for {len(face_ids)} faces...")
        
        try:
            # Update in batches to avoid query limits
            batch_size = 100
            updated_count = 0
            
            for i in range(0, len(face_ids), batch_size):
                batch = face_ids[i:i + batch_size]
                
                response = self.client.table("photo_faces").update({
                    "excluded_from_index": excluded
                }).in_("id", batch).execute()
                
                if response.data:
                    updated_count += len(response.data)
            
            print(f"[Audit] ✓ Updated {updated_count} faces")
            return updated_count
            
        except Exception as e:
            print(f"[Audit] ERROR setting excluded_from_index: {str(e)}")
            return 0
    
    def get_excluded_stats_by_person(self) -> List[dict]:
        """
        Get exclusion statistics grouped by person.
        
        Returns:
            List of dicts with person_id, name, total_count, excluded_count
        """
        print("[Audit] Getting excluded stats by person...")
        
        try:
            # Get all people with their face counts
            response = self.client.rpc(
                "get_excluded_stats_by_person"
            ).execute()
            
            if response.data:
                return response.data
            
            # Fallback: manual aggregation if RPC doesn't exist
            # Get all faces grouped by person
            faces_response = self.client.table("photo_faces").select(
                "person_id, excluded_from_index"
            ).not_.is_(
                "person_id", "null"
            ).not_.is_(
                "insightface_descriptor", "null"
            ).execute()
            
            if not faces_response.data:
                return []
            
            # Aggregate manually
            stats = {}
            for face in faces_response.data:
                pid = face["person_id"]
                if pid not in stats:
                    stats[pid] = {"total": 0, "excluded": 0}
                stats[pid]["total"] += 1
                if face.get("excluded_from_index"):
                    stats[pid]["excluded"] += 1
            
            # Get person names
            person_ids = list(stats.keys())
            people_response = self.client.table("people").select(
                "id, name"
            ).in_("id", person_ids).execute()
            
            names = {p["id"]: p["name"] for p in (people_response.data or [])}
            
            result = []
            for pid, counts in stats.items():
                if counts["excluded"] > 0:  # Only return people with excluded faces
                    result.append({
                        "person_id": pid,
                        "name": names.get(pid, "Unknown"),
                        "total_count": counts["total"],
                        "excluded_count": counts["excluded"]
                    })
            
            return sorted(result, key=lambda x: x["excluded_count"], reverse=True)
            
        except Exception as e:
            print(f"[Audit] ERROR getting excluded stats: {str(e)}")
            return []
    
    async def get_all_unknown_faces(self) -> List[dict]:
        """
        Get ALL unrecognized faces from the entire database with pagination.
        
        Returns:
            List of dicts with id, photo_id, insightface_descriptor, insightface_bbox,
            photo_url, gallery_id, gallery_title, shoot_date
        """
        print("[v4.2] Getting ALL unknown faces from database with pagination...")
        
        try:
            all_faces = []
            page_size = 1000
            offset = 0
            
            while True:
                # Query with join to get photo URL and gallery info
                response = self.client.table("photo_faces").select(
                    "id, photo_id, insightface_descriptor, insightface_bbox, "
                    "gallery_images!inner(id, image_url, gallery_id, galleries(id, title, shoot_date))"
                ).is_(
                    "person_id", "null"
                ).eq(
                    "verified", False
                ).not_.is_(
                    "insightface_descriptor", "null"
                ).order("created_at", desc=False).range(offset, offset + page_size - 1).execute()
                
                if not response.data or len(response.data) == 0:
                    break
                
                # Normalize the nested data
                for face in response.data:
                    gallery_images = face.get("gallery_images", {})
                    galleries = gallery_images.get("galleries", {}) if gallery_images else {}
                    
                    normalized = {
                        "id": face["id"],
                        "photo_id": face["photo_id"],
                        "insightface_descriptor": face["insightface_descriptor"],
                        "insightface_bbox": face.get("insightface_bbox"),
                        "photo_url": gallery_images.get("image_url") if gallery_images else None,
                        "gallery_id": gallery_images.get("gallery_id") if gallery_images else None,
                        "gallery_title": galleries.get("title") if galleries else None,
                        "shoot_date": galleries.get("shoot_date") if galleries else None,
                    }
                    all_faces.append(normalized)
                
                print(f"[v4.2] Loaded page: offset={offset}, count={len(response.data)}, total so far={len(all_faces)}")
                
                if len(response.data) < page_size:
                    break
                
                offset += page_size
            
            print(f"[v4.2] ✓ Total unknown faces loaded: {len(all_faces)}")
            return all_faces
            
        except Exception as e:
            print(f"[v4.2] ERROR getting all unknown faces: {str(e)}")
            import traceback
            print(f"[v4.2] Traceback:\n{traceback.format_exc()}")
            return []
    
    async def find_verified_face_by_embedding(
        self, 
        embedding: np.ndarray, 
        similarity_threshold: float = 0.60  # Now accepts dynamic threshold from slider
    ) -> Optional[Tuple[str, float]]:
        """
        Find a verified face in Supabase by embedding similarity
        
        Args:
            embedding: 512-dim numpy array from InsightFace
            similarity_threshold: Minimum cosine similarity (0-1), from admin panel slider
        
        Returns:
            Tuple of (person_id, confidence) if match found, None otherwise
        """
        print(f"[v3.22] Searching for verified face with similarity >= {similarity_threshold}")
        
        try:
            # Load all verified embeddings
            person_ids, embeddings, verified_flags, confidences = self.get_all_player_embeddings()
            
            if len(embeddings) == 0:
                print("[v3.22] No verified embeddings to search")
                return None
            
            # Calculate cosine similarity with all verified embeddings
            embedding_norm = embedding / np.linalg.norm(embedding)
            
            best_similarity = 0.0
            best_person_id = None
            
            for i, (person_id, verified_embedding) in enumerate(zip(person_ids, embeddings)):
                # Only search verified faces for this method
                if not verified_flags[i]:
                    continue
                    
                verified_norm = verified_embedding / np.linalg.norm(verified_embedding)
                similarity = float(np.dot(embedding_norm, verified_norm))
                
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_person_id = person_id
            
            print(f"[v3.22] Best match: person_id={best_person_id}, similarity={best_similarity:.3f}")
            
            if best_similarity >= similarity_threshold:
                print(f"[v3.22] ✓ Match found above threshold")
                return best_person_id, best_similarity
            else:
                print(f"[v3.22] No match above threshold {similarity_threshold}")
                return None
                
        except Exception as e:
            print(f"[v3.22] ERROR searching for verified face: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"[v3.22] Traceback:\n{traceback.format_exc()}")
            return None
    
    async def is_face_rejected(
        self,
        embedding: np.ndarray,
        similarity_threshold: float = 0.85
    ) -> bool:
        """
        Check if a face embedding matches any rejected face
        
        Args:
            embedding: 512-dim numpy array from InsightFace
            similarity_threshold: High threshold (0.85) to avoid false positives
        
        Returns:
            True if face should be rejected, False otherwise
        """
        print(f"[v3.23] Checking if face is rejected (threshold={similarity_threshold})")
        
        try:
            response = self.client.table("rejected_faces").select("descriptor").execute()
            
            if not response.data or len(response.data) == 0:
                print("[v3.23] No rejected faces in database")
                return False
            
            print(f"[v3.23] Checking against {len(response.data)} rejected faces")
            
            embedding_norm = embedding / np.linalg.norm(embedding)
            
            for row in response.data:
                descriptor = row["descriptor"]
                
                if isinstance(descriptor, list):
                    rejected_embedding = np.array(descriptor, dtype=np.float32)
                elif isinstance(descriptor, str):
                    rejected_embedding = np.array(json.loads(descriptor), dtype=np.float32)
                else:
                    continue
                
                rejected_norm = rejected_embedding / np.linalg.norm(rejected_embedding)
                similarity = float(np.dot(embedding_norm, rejected_norm))
                
                if similarity >= similarity_threshold:
                    print(f"[v3.23] ✓ Face matches rejected face (similarity={similarity:.3f})")
                    return True
            
            print("[v3.23] Face not rejected")
            return False
            
        except Exception as e:
            print(f"[v3.23] ERROR checking rejected faces: {str(e)}")
            return False
    
    async def reject_face_cluster(
        self,
        descriptors: List[np.ndarray],
        gallery_id: str,
        photo_ids: List[str],
        rejected_by: str,
        reason: str = None
    ) -> bool:
        """
        Mark a cluster of faces as rejected (not interesting)
        
        Args:
            descriptors: List of face embeddings to reject
            gallery_id: Gallery where faces were found
            photo_ids: Photo IDs where faces appear
            rejected_by: User ID who rejected the faces
            reason: Optional reason for rejection
        
        Returns:
            True if successful
        """
        print(f"[v3.23] Rejecting {len(descriptors)} faces from gallery {gallery_id}")
        
        try:
            for i, descriptor in enumerate(descriptors):
                photo_id = photo_ids[i] if i < len(photo_ids) else None
                
                self.client.table("rejected_faces").insert({
                    "descriptor": descriptor.tolist(),
                    "gallery_id": gallery_id,
                    "photo_id": photo_id,
                    "rejected_by": rejected_by,
                    "reason": reason
                }).execute()
            
            print(f"[v3.23] ✓ Successfully rejected {len(descriptors)} faces")
            return True
            
        except Exception as e:
            print(f"[v3.23] ERROR rejecting faces: {str(e)}")
            return False
    
    async def get_unknown_faces_from_gallery(
        self,
        gallery_id: str
    ) -> List[dict]:
        """
        Get all unrecognized faces from a gallery with pagination.
        
        Returns:
            List of dicts with photo_id, insightface_descriptor, insightface_bbox
        """
        print(f"[v4.2] Getting unknown faces from gallery {gallery_id} with pagination...")
        
        try:
            # Get all photos from gallery with pagination
            all_photo_ids = []
            page_size = 1000
            offset = 0
            
            while True:
                photos_response = self.client.table("gallery_images").select(
                    "id"
                ).eq(
                    "gallery_id", gallery_id
                ).range(offset, offset + page_size - 1).execute()
                
                if not photos_response.data or len(photos_response.data) == 0:
                    break
                
                all_photo_ids.extend([p["id"] for p in photos_response.data])
                
                if len(photos_response.data) < page_size:
                    break
                    
                offset += page_size
            
            if not all_photo_ids:
                print("[v4.2] No photos in gallery")
                return []
            
            print(f"[v4.2] Found {len(all_photo_ids)} photos in gallery")
            
            # Get unverified faces without person_id - with pagination
            # Process in batches of 100 photo_ids to avoid query limits
            all_faces = []
            batch_size = 100
            
            for i in range(0, len(all_photo_ids), batch_size):
                batch_photo_ids = all_photo_ids[i:i + batch_size]
                
                faces_response = self.client.table("photo_faces").select(
                    "id, photo_id, insightface_descriptor, insightface_bbox, insightface_confidence"
                ).in_(
                    "photo_id", batch_photo_ids
                ).is_(
                    "person_id", "null"
                ).eq(
                    "verified", False
                ).not_.is_(
                    "insightface_descriptor", "null"
                ).execute()
                
                if faces_response.data:
                    all_faces.extend(faces_response.data)
                
                print(f"[v4.2] Processed photo batch {i//batch_size + 1}, faces so far: {len(all_faces)}")
            
            print(f"[v4.2] ✓ Found {len(all_faces)} unknown faces in gallery")
            return all_faces
            
        except Exception as e:
            print(f"[v4.2] ERROR getting unknown faces: {str(e)}")
            import traceback
            print(f"[v4.2] Traceback:\n{traceback.format_exc()}")
            return []

    def get_person_info(self, person_id: str) -> Optional[dict]:
        """Get person information by ID"""
        try:
            response = self.client.table("people").select("*").eq("id", person_id).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
            
        except Exception as e:
            print(f"[v3.0] ERROR getting person info: {str(e)}")
            return None
    
    def get_config(self) -> Dict:
        """
        Get configuration from face_recognition_config table.
        
        Returns:
            Dict with config key-value pairs
        """
        try:
            response = self.client.table("face_recognition_config").select("key, value").execute()
            
            config = {}
            for row in response.data:
                config[row["key"]] = row["value"]
            
            print(f"[SupabaseDatabase] Loaded {len(config)} config entries from DB")
            return config
            
        except Exception as e:
            print(f"[SupabaseDatabase] Error getting config: {e}")
            return {}
    
    def get_recognition_config(self) -> Dict:
        """
        Get recognition settings from face_recognition_config.
        Loads confidence_threshold and other settings from the database.
        
        Returns:
            Dict with config including confidence_thresholds, quality_filters, etc.
        """
        try:
            config = self.get_config()
            
            print(f"[SupabaseDatabase] Raw config from DB: {config}")
            
            defaults = {
                'confidence_thresholds': {
                    'low_data': 0.75,
                    'medium_data': 0.65,
                    'high_data': 0.55
                },
                'context_weight': 0.10,
                'min_faces_per_person': 3,
                'auto_retrain_threshold': 25,
                'auto_retrain_percentage': 0.10,
                'quality_filters': {
                    'min_detection_score': 0.70,
                    'min_face_size': 80,
                    'min_blur_score': 80
                }
            }
            
            # Merge with stored config
            result = defaults.copy()
            if 'recognition_settings' in config:
                stored_settings = config['recognition_settings']
                print(f"[SupabaseDatabase] Stored settings from DB: {stored_settings}")
                # Deep merge for nested objects
                if 'confidence_thresholds' in stored_settings:
                    result['confidence_thresholds'].update(stored_settings['confidence_thresholds'])
                if 'quality_filters' in stored_settings:
                    result['quality_filters'].update(stored_settings['quality_filters'])
                # Update top-level fields
                for key in ['context_weight', 'min_faces_per_person', 'auto_retrain_threshold', 'auto_retrain_percentage']:
                    if key in stored_settings:
                        result[key] = stored_settings[key]
            else:
                print(f"[SupabaseDatabase] No 'recognition_settings' key found in config, using defaults")
            
            print(f"[SupabaseDatabase] Final merged config: {result}")
            return result
            
        except Exception as e:
            print(f"[SupabaseDatabase] Error getting recognition config: {e}")
            # Return defaults on error
            return {
                'confidence_thresholds': {
                    'low_data': 0.75,
                    'medium_data': 0.65,
                    'high_data': 0.55
                },
                'context_weight': 0.10,
                'min_faces_per_person': 3,
                'auto_retrain_threshold': 25,
                'auto_retrain_percentage': 0.10,
                'quality_filters': {
                    'min_detection_score': 0.70,
                    'min_face_size': 80,
                    'min_blur_score': 80
                }
            }
    
    def get_recognition_config_sync(self) -> Dict:
        """Synchronous version of get_recognition_config"""
        return self.get_recognition_config()
