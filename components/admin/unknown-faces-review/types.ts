/**
 * Props for UnknownFacesReviewDialog
 */
export interface UnknownFacesReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  galleryId: string
  onComplete?: () => void
}

/**
 * Bounding box for face crop
 */
export interface FaceBbox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Single face in a cluster
 */
export interface ClusterFace {
  id: string
  photo_id: string
  image_url: string
  bbox: FaceBbox
  original_filename?: string
  gallery_id?: string
  gallery_title?: string
  shoot_date?: string
  distance_to_centroid?: number
}

/**
 * Cluster of similar faces
 */
export interface Cluster {
  cluster_id: number
  size: number
  faces: ClusterFace[]
}

/**
 * Best face for avatar generation
 */
export interface BestFaceForAvatar {
  image_url: string
  bbox: FaceBbox
}
