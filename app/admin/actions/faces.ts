"use server"

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"

/**
 * Process photo for face detection and recognition
 * Backend handles embeddings internally
 *
 * @param photoId - Photo ID
 * @param forceRedetect - Force redetection (deletes existing faces)
 * @param applyQualityFilters - Apply quality filters (blur, size, confidence)
 */
export async function processPhotoAction(photoId: string, forceRedetect = false, applyQualityFilters = true) {
  try {
    const result = await apiFetch("/api/recognition/process-photo", {
      method: "POST",
      body: JSON.stringify({
        photo_id: photoId,
        force_redetect: forceRedetect,
        apply_quality_filters: applyQualityFilters,
      }),
    })

    if (result.success) {
      return {
        success: true,
        faces: result.data || [],
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to process photo",
      }
    }
  } catch (error) {
    console.error("[processPhotoAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Batch verify faces: update person_ids + delete removed faces
 *
 * @param photoId - Photo ID
 * @param keptFaces - Array of faces to keep [{id, person_id}]
 */
export async function batchVerifyFacesAction(
  photoId: string,
  keptFaces: Array<{ id: string | null; person_id: string | null }>,
) {
  try {
    const result = await apiFetch("/api/faces/batch-verify", {
      method: "POST",
      body: JSON.stringify({
        photo_id: photoId,
        kept_faces: keptFaces,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        verified: result.verified,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to verify faces",
      }
    }
  } catch (error) {
    console.error("[batchVerifyFacesAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * @deprecated Use processPhotoAction with forceRedetect=true (v2.3.0+)
 */
export async function verifyFaceAction(photoFaceId: string, personId: string | null, verified: boolean) {
  console.warn("[verifyFaceAction] DEPRECATED: Use batchVerifyFacesAction instead (v2.3.0)")
  return {
    success: false,
    error: "This action is deprecated. Use batchVerifyFacesAction instead.",
  }
}

/**
 * @deprecated Use processPhotoAction + batchVerifyFacesAction instead (v2.3.0+)
 */
export async function saveDetectedFaceAction(...args: any[]) {
  console.warn("[saveDetectedFaceAction] DEPRECATED (v2.3.0)")
  return { success: false, error: "Deprecated" }
}

/**
 * @deprecated Use batchVerifyFacesAction instead (v2.3.0+)
 */
export async function savePhotoFaceAction(...args: any[]) {
  console.warn("[savePhotoFaceAction] DEPRECATED (v2.3.0)")
  return { success: false, error: "Deprecated" }
}

/**
 * @deprecated Not needed in v2.3.0+
 */
export async function saveFaceDescriptorAction(...args: any[]) {
  console.warn("[saveFaceDescriptorAction] DEPRECATED (v2.3.0)")
  return { success: false, error: "Deprecated" }
}
