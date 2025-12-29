/**
 * Face Training Manager Constants
 */

import type { Config } from "./types"

export const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://23.88.61.20:8001"

export const DEFAULT_CONFIG: Config = {
  confidence_thresholds: {
    low_data: 0.75,
    medium_data: 0.65,
    high_data: 0.55,
  },
  context_weight: 0.1,
  min_faces_per_person: 3,
  auto_retrain_threshold: 25,
  auto_retrain_percentage: 0.1,
  quality_filters: {
    min_detection_score: 0.7,
    min_face_size: 80,
    min_blur_score: 80.0,
  },
  auto_avatar_on_create: false,  // v1.1.14: Default to false for safety
}
