import type { TaggedFace, Person } from "@/lib/types"
import type { BoundingBox } from "@/lib/avatar-utils"

/**
 * Props for FaceTaggingDialog component
 */
export interface FaceTaggingDialogProps {
  imageId: string
  imageUrl: string
  originalFilename?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: (imageId: string, faces: TaggedFace[], indexRebuilt?: boolean) => void
  hasBeenProcessed?: boolean
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

/**
 * Detailed face data for metrics dialog
 */
export interface DetailedFace {
  boundingBox: BoundingBox
  size: number
  blur_score?: number
  detection_score: number
  recognition_confidence?: number | null
  embedding_quality?: number
  distance_to_nearest?: number
  top_matches?: Array<{
    person_id: string
    name: string
    similarity: number
    source_verified?: boolean
    source_confidence?: number
  }>
  person_name?: string | null
}

/**
 * Image fit mode for canvas display
 */
export type ImageFitMode = "contain" | "cover"

/**
 * Face colors for visual distinction
 */
export const FACE_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
] as const
