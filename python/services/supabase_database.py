import os
import numpy as np
from typing import List, Tuple, Optional, Dict
from supabase import create_client, Client


class SupabaseDatabase:
    """Database service for loading embeddings from Supabase PostgreSQL"""
    
    def __init__(self):
        """Initialize Supabase client"""
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self.client: Client = create_client(supabase_url, supabase_key)
        print("[v2.5] SupabaseDatabase initialized")
    
    def get_all_player_embeddings(self) -> Tuple[List[str], List[np.ndarray]]:
        """
        Load all verified InsightFace embeddings from photo_faces table
        
        Returns:
            Tuple of (person_ids, embeddings) where:
            - person_ids: List of person IDs (one per embedding)
            - embeddings: List of 512-dim numpy arrays
        """
        print("[v2.5] Loading embeddings from Supabase photo_faces table...")
        
        try:
            all_data = []
            page_size = 1000  # Supabase default limit
            offset = 0
            
            while True:
                # Query photo_faces table with pagination
                response = self.client.table("photo_faces").select(
                    "id, person_id, insightface_descriptor, created_at"
                ).eq(
                    "verified", True
                ).not_.is_(
                    "insightface_descriptor", "null"
                ).not_.is_(
                    "person_id", "null"
                ).order("created_at", desc=False).range(offset, offset + page_size - 1).execute()
                
                if not response.data or len(response.data) == 0:
                    break  # No more data
                
                all_data.extend(response.data)
                print(f"[v2.5] Loaded page: offset={offset}, count={len(response.data)}, total so far={len(all_data)}")
                
                # If we got less than page_size, we've reached the end
                if len(response.data) < page_size:
                    break
                
                offset += page_size
            
            if not all_data:
                print("[v2.5] No verified embeddings found in database")
                return [], []
            
            total_rows = len(all_data)
            print(f"[v2.5] ✓ Loaded ALL {total_rows} verified faces with embeddings from database (paginated)")
            print(f"[v2.5] First 3 IDs from DB: {[row['id'] for row in all_data[:3]]}")
            print(f"[v2.5] Last 3 IDs from DB: {[row['id'] for row in all_data[-3:]]}")
            print(f"[v2.5] First 3 person_ids from DB: {[row['person_id'] for row in all_data[:3]]}")
            print(f"[v2.5] Last 3 person_ids from DB: {[row['person_id'] for row in all_data[-3:]]}")
            
            person_ids = []
            embeddings = []
            skipped_count = 0
            
            person_id_counts = {}
            face_id_list = []
            
            for row in all_data:
                face_id = row["id"]
                person_id = row["person_id"]
                descriptor = row["insightface_descriptor"]
                
                face_id_list.append(face_id)
                person_id_counts[person_id] = person_id_counts.get(person_id, 0) + 1
                
                # Convert descriptor to numpy array
                if isinstance(descriptor, list):
                    embedding = np.array(descriptor, dtype=np.float32)
                elif isinstance(descriptor, str):
                    import json
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)
                else:
                    print(f"[v2.5] WARNING: Unknown descriptor type for face_id={face_id}: {type(descriptor)}")
                    skipped_count += 1
                    continue
                
                # Validate embedding dimension
                if len(embedding) != 512:
                    print(f"[v2.5] WARNING: Invalid embedding dimension {len(embedding)} for face_id={face_id}, expected 512")
                    skipped_count += 1
                    continue
                
                person_ids.append(str(person_id))
                embeddings.append(embedding)
            
            unique_people = len(set(person_ids))
            print(f"[v2.5] ✓ Loaded {len(embeddings)} valid embeddings for {unique_people} unique people")
            if skipped_count > 0:
                print(f"[v2.5] Skipped {skipped_count} invalid embeddings")
            
            top_people = sorted(person_id_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            print(f"[v2.5] Top 5 people by descriptor count: {top_people}")
            print(f"[v2.5] First 3 loaded face IDs: {face_id_list[:3]}")
            print(f"[v2.5] Last 3 loaded face IDs: {face_id_list[-3:]}")
            
            return person_ids, embeddings
            
        except Exception as e:
            print(f"[v2.5] ERROR loading embeddings from Supabase: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"[v2.5] Traceback:\n{traceback.format_exc()}")
            return [], []
    
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
            person_ids, embeddings = self.get_all_player_embeddings()
            
            if len(embeddings) == 0:
                print("[v3.22] No verified embeddings to search")
                return None
            
            # Calculate cosine similarity with all verified embeddings
            embedding_norm = embedding / np.linalg.norm(embedding)
            
            best_similarity = 0.0
            best_person_id = None
            
            for person_id, verified_embedding in zip(person_ids, embeddings):
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
                    import json
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
        Get all unrecognized faces from a gallery
        
        Returns:
            List of dicts with photo_id, insightface_descriptor, insightface_bbox
        """
        print(f"[v3.23] Getting unknown faces from gallery {gallery_id}")
        
        try:
            # Get all photos from gallery
            photos_response = self.client.table("gallery_images").select(
                "id"
            ).eq(
                "gallery_id", gallery_id
            ).execute()
            
            if not photos_response.data:
                print("[v3.23] No photos in gallery")
                return []
            
            photo_ids = [p["id"] for p in photos_response.data]
            
            # Get unverified faces without person_id
            faces_response = self.client.table("photo_faces").select(
                "id, photo_id, insightface_descriptor, insightface_bbox, insightface_confidence"
            ).in_(
                "photo_id", photo_ids
            ).is_(
                "person_id", "null"
            ).eq(
                "verified", False
            ).not_.is_(
                "insightface_descriptor", "null"
            ).execute()
            
            print(f"[v3.23] Found {len(faces_response.data)} unknown faces")
            return faces_response.data
            
        except Exception as e:
            print(f"[v3.23] ERROR getting unknown faces: {str(e)}")
            return []

    async def save_face_descriptor(
        self,
        person_id: str,
        descriptor: List[float],
        source_image_id: str
    ) -> bool:
        """
        Save a face descriptor to the face_descriptors table
        
        Args:
            person_id: ID of the person
            descriptor: 512-dim embedding as list
            source_image_id: Photo ID where face was found
        
        Returns:
            True if successful
        """
        print(f"[v3.26] Saving descriptor for person {person_id} from image {source_image_id}")
        
        try:
            self.client.table("face_descriptors").insert({
                "person_id": person_id,
                "descriptor": descriptor,
                "source_image_id": source_image_id
            }).execute()
            
            print(f"[v3.26] ✓ Descriptor saved successfully")
            return True
            
        except Exception as e:
            print(f"[v3.26] ERROR saving descriptor: {str(e)}")
            return False

    def get_person_info(self, person_id: str) -> Optional[dict]:
        """Get person information by ID"""
        try:
            response = self.client.table("people").select("*").eq("id", person_id).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
            
        except Exception as e:
            print(f"[v2.5] ERROR getting person info: {str(e)}")
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
