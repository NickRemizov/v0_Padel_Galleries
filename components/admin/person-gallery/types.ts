/**
 * Props for PersonGalleryDialog
 */
export interface PersonGalleryDialogProps {
  personId: string
  personName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Bounding box for face position
 */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Photo with person face data
 */
export interface PersonPhoto {
  id: string
  image_url: string
  gallery_id: string
  width: number
  height: number
  faceId: string
  confidence: number | null
  verified: boolean
  excluded_from_index?: boolean
  boundingBox: BoundingBox | null
  faceCount: number
  filename: string
  gallery_name?: string
  shootDate?: string
  sort_order?: string
  created_at?: string
}

/**
 * State for tagging dialog with navigation
 */
export interface TaggingImageState {
  id: string
  url: string
  prevId: string | null
  nextId: string | null
}

/**
 * Confirm dialog state
 */
export interface ConfirmDialogState {
  open: boolean
  action: "verify" | "delete" | null
  count: number
}

/**
 * Single delete dialog state
 */
export interface SingleDeleteDialogState {
  open: boolean
  photoId: string | null
  filename: string
  galleryName: string
}

/**
 * Verify button state
 */
export interface VerifyButtonState {
  disabled: boolean
  text: string
  count: number
}
