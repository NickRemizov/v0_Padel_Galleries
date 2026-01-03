import type { GalleryImage } from "@/lib/types"

/**
 * Face data structure used in photoFacesMap
 */
export interface FaceData {
  verified: boolean
  confidence: number
  person_id: string | null
  bbox: { x: number; y: number; width: number; height: number } | null
}

/**
 * State for currently open tagging dialog with neighbor navigation
 */
export interface TaggingImageState {
  id: string
  url: string
  originalFilename: string
  hasBeenProcessed: boolean
  prevId: string | null
  nextId: string | null
}

/**
 * Props for GalleryImagesManager component
 */
export interface GalleryImagesManagerProps {
  galleryId: string
  galleryTitle: string
  shootDate?: string | null
  initialSortOrder?: string
  isFullyVerified?: boolean
  /** Called when images count changes (add/delete) */
  onImagesChange?: () => void
}

/**
 * Sort options for gallery images
 */
export type SortOption = "filename" | "created" | "added"

/**
 * Recognition stats per photo
 */
export interface PhotoRecognitionStats {
  total: number
  recognized: number
  fullyRecognized: boolean
}

/**
 * Confirm dialog state
 */
export interface ConfirmDialogState {
  open: boolean
  action: "delete" | null
  count: number
}

/**
 * Single delete dialog state
 */
export interface SingleDeleteDialogState {
  open: boolean
  imageId: string | null
  filename: string | null
}
