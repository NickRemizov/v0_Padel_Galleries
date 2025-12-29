"use server"

/**
 * Face CRUD Actions
 * 
 * Basic CRUD operations for faces:
 * - getPhotoFacesAction
 * - savePhotoFaceAction
 * - updatePhotoFaceAction
 * - deletePhotoFaceAction
 */

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"

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

/**
 * Save a new face to database
 * Backend returns: { success, data: { face: {...}, index_updated: bool } }
 */
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
    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/faces/save", {
      method: "POST",
      headers,
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
        face_id: result.data?.face?.id,
        index_updated: result.data?.index_updated ?? false,
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

export async function updatePhotoFaceAction(
  faceId: string,
  updates: {
    person_id?: string | null
    verified?: boolean
    recognition_confidence?: number
  },
) {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/faces/update", {
      method: "POST",
      headers,
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

/**
 * Delete a face from database
 * Backend returns: { success, data: { deleted, index_updated } }
 */
export async function deletePhotoFaceAction(faceId: string) {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/faces/delete", {
      method: "POST",
      headers,
      body: JSON.stringify({
        face_id: faceId,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        index_updated: result.data?.index_updated ?? false,
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
