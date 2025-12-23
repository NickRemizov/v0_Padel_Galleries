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
        verified: result.data?.verified ?? result.verified,
        index_rebuilt: result.data?.index_rebuilt ?? result.index_rebuilt ?? false,
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

/**
 * Batch delete multiple gallery images in one request
 * Performance: O(1) instead of O(n) - single HTTP request, single index rebuild
 *
 * @param imageIds - Array of image IDs to delete
 * @param galleryId - Gallery ID
 */
export async function batchDeleteGalleryImagesAction(imageIds: string[], galleryId: string) {
  try {
    if (imageIds.length === 0) {
      return { success: true, deleted_count: 0 }
    }

    console.log(`[batchDeleteGalleryImagesAction] Deleting ${imageIds.length} images from gallery ${galleryId}`)

    // Use POST instead of DELETE - DELETE with body is unreliable
    const result = await apiFetch("/api/galleries/batch-delete-images", {
      method: "POST",
      body: JSON.stringify({
        image_ids: imageIds,
        gallery_id: galleryId,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        deleted_count: result.data?.deleted_count ?? result.deleted_count,
        had_verified_faces: result.data?.had_verified_faces ?? result.had_verified_faces,
        index_rebuilt: result.data?.index_rebuilt ?? result.index_rebuilt,
      }
    } else {
      return {
        success: false,
        error: result.detail || result.error || result.message || "Failed to delete images",
      }
    }
  } catch (error) {
    console.error("[batchDeleteGalleryImagesAction] Error:", error)
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
        index_rebuilt: result.data?.index_rebuilt ?? false,
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

/**
 * Cluster unknown faces for review.
 * Backend returns ApiResponse format: {success, data: {clusters, ungrouped_faces}}
 *
 * @param galleryId - Gallery ID to cluster faces from
 */
export async function clusterUnknownFacesAction(galleryId: string) {
  try {
    console.log("[v0] [clusterUnknownFacesAction] START - Gallery ID:", galleryId)

    const result = await apiFetch<{ success: boolean; data: { clusters: any[]; ungrouped_faces: any[] } }>(
      `/api/recognition/cluster-unknown-faces?gallery_id=${galleryId}&min_cluster_size=2`,
      {
        method: "POST",
      },
    )

    console.log("[v0] [clusterUnknownFacesAction] FastAPI raw response:", JSON.stringify(result, null, 2))

    // Backend returns ApiResponse: {success, data: {clusters, ungrouped_faces}}
    const clusters = result.data?.clusters || []
    const ungroupedFaces = result.data?.ungrouped_faces || []

    console.log("[v0] [clusterUnknownFacesAction] Clusters count:", clusters.length)

    return {
      success: true,
      data: {
        clusters: clusters,
        ungrouped_faces: ungroupedFaces,
      },
    }
  } catch (error) {
    console.error(
      "[v0] [clusterUnknownFacesAction] Full error:",
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    )
    console.error(
      "[v0] [clusterUnknownFacesAction] Error message:",
      error instanceof Error ? error.message : String(error),
    )
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Batch assign multiple faces to a person.
 * Uses new /api/faces/batch-assign endpoint that rebuilds index ONCE at the end.
 * 
 * v4.7: Much more efficient than calling update N times.
 *
 * @param faceIds - Array of face IDs to assign
 * @param personId - Person ID to assign to
 */
export async function assignFacesToPersonAction(faceIds: string[], personId: string) {
  try {
    console.log("[assignFacesToPersonAction] Assigning", faceIds.length, "faces to person:", personId)

    const result = await apiFetch("/api/faces/batch-assign", {
      method: "POST",
      body: JSON.stringify({
        face_ids: faceIds,
        person_id: personId,
      }),
    })

    console.log("[assignFacesToPersonAction] Result:", JSON.stringify(result, null, 2))

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        updated_count: result.data?.updated_count ?? 0,
        index_rebuilt: result.data?.index_rebuilt ?? false,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to assign faces",
      }
    }
  } catch (error) {
    console.error("[assignFacesToPersonAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Recognize all unknown faces by running them through the recognition algorithm.
 * Useful after manually assigning photos to a new player.
 *
 * @param galleryId - Optional gallery ID to filter faces
 * @param confidenceThreshold - Optional confidence threshold (uses config default if not provided)
 */
export async function recognizeUnknownFacesAction(galleryId?: string, confidenceThreshold?: number) {
  try {
    console.log("[recognizeUnknownFacesAction] START - Gallery ID:", galleryId)

    const result = await apiFetch("/api/faces/recognize-unknown", {
      method: "POST",
      body: JSON.stringify({
        gallery_id: galleryId || null,
        confidence_threshold: confidenceThreshold || null,
      }),
    })

    console.log("[recognizeUnknownFacesAction] Response:", JSON.stringify(result, null, 2))

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        total_unknown: result.data?.total_unknown ?? 0,
        recognized_count: result.data?.recognized_count ?? 0,
        by_person: result.data?.by_person ?? [],
        index_rebuilt: result.data?.index_rebuilt ?? false,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to recognize unknown faces",
      }
    }
  } catch (error) {
    console.error("[recognizeUnknownFacesAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
