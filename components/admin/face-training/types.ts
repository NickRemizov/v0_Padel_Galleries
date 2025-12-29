/**
 * Face Training Manager Types
 */

export interface TrainingSession {
  id: string
  created_at: string
  training_mode: string
  faces_count: number
  people_count: number
  metrics: {
    accuracy?: number
    precision?: number
    recall?: number
  }
  status: string
}

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
  auto_avatar_on_create?: boolean
}

export interface DatasetStats {
  total_people: number
  total_faces: number
  faces_per_person: {
    min: number
    max: number
    avg: number
  }
  people_by_face_count: Record<string, number>
}
