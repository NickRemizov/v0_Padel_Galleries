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
    const result = await apiFetch("/api/recognition/process-photo", {
      method: "POST",
      body: JSON.stringify({
        photo_id: photoId,
        force_redetect: forceRedetect,
        apply_quality_filters: applyQualityFilters,
        confidence_threshold: qualityParams?.confidenceThreshold ?? 0.6,
        min_detection_score: qualityParams?.minDetectionScore ?? 0.7,
        min_face_size: qualityParams?.minFaceSize ?? 80,
        min_blur_score: qualityParams?.minBlurScore ?? 80,
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

export async function savePhotoFaceAction(
  photoId: string,
  personId: string | null,
  boundingBox: { x: number; y: number; width: number; height: number } | null,
  embedding: number[],
  detectionConfidence: number | null,
  recognitionConfidence: number | null,
  isVerified: boolean,
) {
  try {
    const result = await apiFetch("/api/faces/save", {
      method: "POST",
      body: JSON.stringify({
        photo_id: photoId,
        person_id: personId,
        bounding_box: boundingBox,
        embedding: embedding,
        confidence: detectionConfidence,
        recognition_confidence: recognitionConfidence,
        verified: isVerified,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        face_id: result.data?.id,
        index_updated: result.index_updated,
      }
    } else {
      return {
        success: false,
        error: result.error || "Ошибка при сохранении лица",
      }
    }
  } catch (error) {
    console.error("[savePhotoFaceAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function deleteGalleryImageAction(photoId: string) {
  try {
    const result = await apiFetch(`/api/images/${photoId}`, {
      method: "DELETE",
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        had_descriptors: result.had_descriptors,
        index_rebuilt: result.index_rebuilt,
      }
    } else {
      return {
        success: false,
        error: result.message || "Failed to delete image",
      }
    }
  } catch (error) {
    console.error("[deleteGalleryImageAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function deleteAllGalleryImagesAction(galleryId: string) {
  try {
    const result = await apiFetch(`/api/images/gallery/${galleryId}/all`, {
      method: "DELETE",
    })

    if (result.success || result.deleted_count > 0) {
      revalidatePath("/admin")
      return {
        success: true,
        deleted_count: result.deleted_count,
        had_descriptors: result.had_descriptors,
        index_rebuilt: result.index_rebuilt,
      }
    } else {
      return {
        success: false,
        error: result.message || "Failed to delete images",
      }
    }
  } catch (error) {
    console.error("[deleteAllGalleryImagesAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function addGalleryImagesAction(
  galleryId: string,
  uploadedImages: Array<{
    imageUrl: string
    originalUrl: string
    originalFilename: string
    width: number
    height: number
    fileSize: number
  }>,
) {
  try {
    const result = await apiFetch("/api/images/batch-add", {
      method: "POST",
      body: JSON.stringify({
        galleryId,
        images: uploadedImages,
      }),
    })

    if (!result.success) {
      throw new Error(result.message || "Failed to add images")
    }

    revalidatePath("/admin")
    return { success: true, inserted_count: result.inserted_count }
  } catch (error) {
    console.error("[addGalleryImagesAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function getBatchPhotoFacesAction(photoIds: string[]) {
  console.log("[v0] [getBatchPhotoFacesAction] START - photoIds count:", photoIds.length)

  try {
    if (photoIds.length === 0) {
      console.log("[v0] [getBatchPhotoFacesAction] Empty photoIds array, returning empty result")
      return { success: true, data: [] }
    }

    console.log("[v0] [getBatchPhotoFacesAction] Calling FastAPI /api/faces/batch...")

    const result = await apiFetch("/api/faces/batch", {
      method: "POST",
      body: JSON.stringify({ photo_ids: photoIds }),
    })

    console.log("[v0] [getBatchPhotoFacesAction] FastAPI response:", {
      success: result.success,
      dataLength: result.data?.length,
      hasError: !!result.error,
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to load faces")
    }

    return { success: true, data: result.data || [] }
  } catch (error) {
    console.error("[v0] [getBatchPhotoFacesAction] Error:", error)
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function getPhotoFacesAction(photoId: string) {
  try {
    const result = await apiFetch(`/api/faces/photo/${photoId}`, {
      method: "GET",
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to load faces")
    }

    return { success: true, data: result.data || [] }
  } catch (error) {
    console.error("[getPhotoFacesAction] Error:", error)
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function deletePhotoFaceAction(faceId: string) {
  try {
    const result = await apiFetch("/api/faces/delete", {
      method: "POST",
      body: JSON.stringify({
        face_id: faceId,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        index_updated: result.index_updated,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to delete face",
      }
    }
  } catch (error) {
    console.error("[deletePhotoFaceAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function updatePhotoFaceAction(
  faceId: string,
  updates: {
    person_id?: string | null
    verified?: boolean
    recognition_confidence?: number
  },
) {
  try {
    const result = await apiFetch("/api/faces/update", {
      method: "POST",
      body: JSON.stringify({
        face_id: faceId,
        ...updates,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        data: result.data,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to update face",
      }
    }
  } catch (error) {
    console.error("[updatePhotoFaceAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function markPhotoAsProcessedAction(photoId: string) {
  try {
    const result = await apiFetch(`/api/images/${photoId}/mark-processed`, {
      method: "PATCH",
    })

    if (!result.success) {
      throw new Error(result.message || "Failed to mark photo as processed")
    }

    revalidatePath("/admin")
    return { success: true }
  } catch (error) {
    console.error("[markPhotoAsProcessedAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
