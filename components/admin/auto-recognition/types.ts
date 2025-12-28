import type { GalleryImage } from "@/lib/types"

/**
 * Props for AutoRecognitionDialog component
 */
export interface AutoRecognitionDialogProps {
  images: GalleryImage[]
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "all" | "remaining"
}

/**
 * Result of processing a single image
 */
export interface ProcessingResult {
  imageId: string
  filename: string
  facesFound: number
  facesRecognized: number
  status: ProcessingStatus
  error?: string
}

/**
 * Status of image processing
 */
export type ProcessingStatus = "pending" | "processing" | "success" | "error"

/**
 * Quality parameters for face recognition
 */
export interface QualityParams {
  confidenceThreshold: number
  minDetectionScore: number
  minFaceSize: number
  minBlurScore: number
}

/**
 * Statistics from processing results
 */
export interface ProcessingStats {
  totalImages: number
  processedImages: number
  successCount: number
  errorCount: number
  totalFaces: number
  totalRecognized: number
  progress: number
}
