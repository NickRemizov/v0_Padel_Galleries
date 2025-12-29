"use server"

/**
 * Photo Processing Actions
 * 
 * Actions for processing photos for face detection:
 * - processPhotoAction
 * - markPhotoAsProcessedAction
 */

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"

/**
 * Process photo for face detection and recognition
 * Backend handles embeddings internally
 *
 * @param photoId - Photo ID
 * @param forceRedetect - Force redetection (deletes existing faces)
 * @param applyQualityFilters - Apply quality filters (blur, size, confidence)
 * @param qualityParams - Quality filter parameters (optional)
 */
export async function processPhotoAction(
  photoId: string,
  forceRedetect = false,
  applyQualityFilters = true,
  qualityParams?: {
    confidenceThreshold?: number
    minDetectionScore?: number
    minFaceSize?: number
    minBlurScore?: number
  },
) {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/recognition/process-photo", {
      method: "POST",
      headers,
      body: JSON.stringify({
        photo_id: photoId,
        force_redetect: forceRedetect,
        apply_quality_filters: applyQualityFilters,
        confidence_threshold: applyQualityFilters ? (qualityParams?.confidenceThreshold ?? 0.6) : null,
        min_detection_score: applyQualityFilters ? (qualityParams?.minDetectionScore ?? 0.7) : null,
        min_face_size: applyQualityFilters ? (qualityParams?.minFaceSize ?? 80) : null,
        min_blur_score: applyQualityFilters ? (qualityParams?.minBlurScore ?? 80) : null,
      }),
    })

    console.log("[processPhotoAction] Backend response:", JSON.stringify(result, null, 2))

    if (result.success) {
      return {
        success: true,
        faces: result.data || [],
      }
    } else {
      const errorMessage = result.error || "Failed to process photo"
      console.error("[processPhotoAction] Backend error:", errorMessage)

      return {
        success: false,
        error: errorMessage,
      }
    }
  } catch (error) {
    console.error("[processPhotoAction] Exception:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: errorMessage,
    }
  }
}

export async function markPhotoAsProcessedAction(photoId: string) {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/images/${photoId}/mark-processed`, {
      method: "PATCH",
      headers,
    })

    if (result.success) {
      revalidatePath("/admin")
      return { success: true }
    } else {
      return {
        success: false,
        error: result.error || "Failed to mark photo as processed",
      }
    }
  } catch (error) {
    console.error("[markPhotoAsProcessedAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
