/**
 * People Actions - Types
 * 
 * Рефакторинг: 670 строк → 6 модулей
 * @refactored 2025-12-29
 */

// ========== EMBEDDING CONSISTENCY ==========

export interface EmbeddingResult {
  face_id: string
  photo_id: string
  image_url: string | null
  filename: string | null
  image_width: number | null
  image_height: number | null
  bbox: number[] | null  // [x1, y1, x2, y2] from insightface
  verified: boolean
  recognition_confidence: number | null
  similarity_to_centroid: number
  is_outlier: boolean
  is_excluded: boolean  // excluded from index
}

export interface ConsistencyData {
  total_embeddings: number
  overall_consistency: number
  outlier_threshold: number
  outlier_count: number
  excluded_count: number  // count of excluded embeddings
  embeddings: EmbeddingResult[]
  message?: string
}

// ========== CONSISTENCY AUDIT (all players) ==========

export interface ConsistencyAuditResult {
  person_id: string
  person_name: string
  photo_count: number
  descriptor_count: number
  outlier_count: number
  excluded_count: number
  overall_consistency: number
  has_problems: boolean
}

export interface ConsistencyAuditData {
  total_people: number
  people_with_problems: number
  total_outliers: number
  total_excluded: number
  outlier_threshold: number
  results: ConsistencyAuditResult[]
}

// ========== MASS AUDIT (mark outliers as excluded) ==========

export interface MassAuditPersonResult {
  person_id: string
  person_name: string
  newly_excluded: number
  total_excluded: number
  total_descriptors: number
}

export interface MassAuditData {
  people_processed: number
  people_affected: number
  total_newly_excluded: number
  index_rebuilt: boolean
  results: MassAuditPersonResult[]
}

// ========== DUPLICATE PEOPLE DETECTION ==========

export const DUPLICATE_CHECK_FIELDS = [
  "gmail",
  "telegram_username", 
  "telegram_profile_url",
  "facebook_profile_url",
  "instagram_profile_url",
] as const

export type DuplicateField = typeof DUPLICATE_CHECK_FIELDS[number]

export interface DuplicateGroup {
  matchField: DuplicateField
  matchValue: string
  people: DuplicatePerson[]
}

export interface DuplicatePerson {
  id: string
  real_name: string
  telegram_username: string | null
  telegram_profile_url: string | null
  facebook_profile_url: string | null
  instagram_profile_url: string | null
  gmail: string | null
  avatar_url: string | null
  photo_count: number
  created_at: string
}
