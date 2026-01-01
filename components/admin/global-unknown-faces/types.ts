import type { BoundingBox } from "@/lib/avatar-utils"

export interface ClusterFace {
  id: string
  photo_id: string
  image_url: string
  bbox: {
    x: number
    y: number
    width: number
    height: number
  }
  original_filename?: string
  gallery_id?: string
  gallery_title?: string
  shoot_date?: string
  distance_to_centroid?: number
}

export interface Cluster {
  cluster_id: number
  size: number
  faces: ClusterFace[]
}

export interface GlobalUnknownFacesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

export interface BestFaceForAvatar {
  image_url: string
  bbox: BoundingBox
}
