/**
 * Face Recognition Configuration Types
 */

export interface Config {
  confidence_thresholds: {
    low_data: number
    medium_data: number
    high_data: number
  }
  context_weight: number
  min_faces_per_person: number
  auto_retrain_threshold: number
  auto_retrain_percentage: number
  quality_filters?: {
    min_detection_score: number
    min_face_size: number
    min_blur_score: number
  }
}
