"use client"

import { useState, useCallback } from "react"
import type { GalleryImage } from "@/lib/types"
import type { ProcessingResult, QualityParams, ProcessingStats } from "../types"
import { getBatchPhotoFacesAction, markPhotoAsProcessedAction } from "@/app/admin/actions"
import { processPhotoAction, rebuildIndexAction } from "@/app/admin/actions/faces"
import { getRecognitionConfigAction } from "@/app/admin/actions/recognition"

const VERSION = "v5.1-Refactored"

interface UseAutoRecognitionProps {
  images: GalleryImage[]
  mode: "all" | "remaining"
}

/**
 * Hook for auto-recognition processing logic
 */
export function useAutoRecognition({ images, mode }: UseAutoRecognitionProps) {
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<ProcessingResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [applyQualityFilters, setApplyQualityFilters] = useState(true)

  /**
   * Process faces for a single image
   */
  const processImageFaces = useCallback(async (
    photoId: string,
    qualityParams: QualityParams | undefined,
    shouldApplyFilters: boolean
  ): Promise<{ facesFound: number; facesRecognized: number }> => {
    console.log(`[${VERSION}] Processing image: ${photoId}`)
    console.log(`[${VERSION}] Apply quality filters:`, shouldApplyFilters)

    const result = await processPhotoAction(photoId, false, shouldApplyFilters, qualityParams)

    if (!result.success) {
      console.error(`[${VERSION}] processPhotoAction failed:`, result.error)
      throw new Error(result.error || "Failed to process photo")
    }

    const facesFound = result.faces?.length || 0
    const facesRecognized = result.faces?.filter((f: any) => f.person_id).length || 0

    console.log(`[${VERSION}] Detected ${facesFound} faces, recognized ${facesRecognized}`)

    return { facesFound, facesRecognized }
  }, [])

  /**
   * Filter images that need processing (for "remaining" mode)
   */
  const filterImagesToProcess = useCallback(async (allImages: GalleryImage[]): Promise<GalleryImage[]> => {
    if (mode !== "remaining") return allImages

    console.log(`[${VERSION}] Mode is 'remaining', filtering images...`)
    const batchResult = await getBatchPhotoFacesAction(allImages.map((img) => img.id))

    if (!batchResult.success || !batchResult.data) {
      console.log(`[${VERSION}] Batch result failed, using all images`)
      return allImages
    }

    const facesMap = new Map<string, any[]>()
    for (const face of batchResult.data) {
      if (!facesMap.has(face.photo_id)) {
        facesMap.set(face.photo_id, [])
      }
      facesMap.get(face.photo_id)!.push(face)
    }

    const filtered = allImages.filter((image) => {
      const faces = facesMap.get(image.id) || []
      
      // No faces in DB - new photo, needs processing
      if (faces.length === 0) return true
      
      // Has unverified faces - needs processing
      return faces.some((face) => !face.verified)
    })

    console.log(`[${VERSION}] After filter: ${filtered.length} images to process`)
    return filtered
  }, [mode])

  /**
   * Load quality parameters from config
   */
  const loadQualityParams = useCallback(async (): Promise<QualityParams | undefined> => {
    if (!applyQualityFilters) return undefined

    const configResult = await getRecognitionConfigAction()
    console.log(`[${VERSION}] Config loaded:`, configResult.config)

    return {
      confidenceThreshold: configResult.config?.confidence_thresholds?.high_data || 0.6,
      minDetectionScore: configResult.config?.quality_filters?.min_detection_score || 0.7,
      minFaceSize: configResult.config?.quality_filters?.min_face_size || 80,
      minBlurScore: configResult.config?.quality_filters?.min_blur_score || 80,
    }
  }, [applyQualityFilters])

  /**
   * Start processing all images
   */
  const startProcessing = useCallback(async () => {
    console.log(`[${VERSION}] Starting processing, mode=${mode}, images=${images.length}`)

    setProcessing(true)
    setCurrentIndex(-1)

    const qualityParams = await loadQualityParams()
    const imagesToProcess = await filterImagesToProcess(images)

    if (imagesToProcess.length === 0) {
      console.log(`[${VERSION}] No images to process`)
      setProcessing(false)
      return
    }

    // Initialize results
    const initialResults: ProcessingResult[] = imagesToProcess.map((img) => ({
      imageId: img.id,
      filename: img.original_filename,
      facesFound: 0,
      facesRecognized: 0,
      status: "pending",
    }))
    setResults(initialResults)

    // v5.1: Rebuild index before batch processing for consistency
    if (imagesToProcess.length >= 25) {
      console.log(`[${VERSION}] Rebuilding index before processing ${imagesToProcess.length} photos...`)
      try {
        await rebuildIndexAction()
        console.log(`[${VERSION}] Index rebuilt successfully`)
      } catch (error) {
        console.warn(`[${VERSION}] Index rebuild failed, continuing anyway:`, error)
      }
    }

    // Process each image
    for (let i = 0; i < imagesToProcess.length; i++) {
      const image = imagesToProcess[i]
      setCurrentIndex(i)

      setResults((prev) => prev.map((r, idx) => 
        idx === i ? { ...r, status: "processing" as const } : r
      ))

      try {
        const result = await processImageFaces(image.id, qualityParams, applyQualityFilters)
        await markPhotoAsProcessedAction(image.id)

        setResults((prev) => prev.map((r, idx) =>
          idx === i
            ? {
                ...r,
                facesFound: result.facesFound,
                facesRecognized: result.facesRecognized,
                status: "success" as const,
              }
            : r
        ))
      } catch (error) {
        console.error(`[${VERSION}] Error processing image:`, error)
        setResults((prev) => prev.map((r, idx) =>
          idx === i
            ? {
                ...r,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Unknown error",
              }
            : r
        ))
      }
    }

    setProcessing(false)
  }, [images, mode, applyQualityFilters, loadQualityParams, filterImagesToProcess, processImageFaces])

  /**
   * Calculate processing statistics
   */
  const getStats = useCallback((): ProcessingStats => {
    const totalImages = results.length > 0 ? results.length : images.length
    const processedImages = processing 
      ? currentIndex + 1 
      : results.filter((r) => r.status !== "pending").length
    const successCount = results.filter((r) => r.status === "success").length
    const errorCount = results.filter((r) => r.status === "error").length
    const totalFaces = results.reduce((sum, r) => sum + r.facesFound, 0)
    const totalRecognized = results.reduce((sum, r) => sum + r.facesRecognized, 0)
    const progress = totalImages > 0 ? (processedImages / totalImages) * 100 : 0

    return {
      totalImages,
      processedImages,
      successCount,
      errorCount,
      totalFaces,
      totalRecognized,
      progress,
    }
  }, [results, images.length, processing, currentIndex])

  return {
    processing,
    results,
    applyQualityFilters,
    setApplyQualityFilters,
    startProcessing,
    getStats,
  }
}
