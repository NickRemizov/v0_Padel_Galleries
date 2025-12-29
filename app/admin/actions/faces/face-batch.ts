"use server"

/**
 * Face Batch Actions
 * 
 * Batch operations for faces:
 * - getBatchPhotoFacesAction
 * - batchVerifyFacesAction
 * - assignFacesToPersonAction
 */

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"

export async function getBatchPhotoFacesAction(photoIds: string[]) {
  console.log("[v0] [getBatchPhotoFacesAction] START - photoIds count:", photoIds.length)

  try {
    if (photoIds.length === 0) {
      console.log("[v0] [getBatchPhotoFacesAction] Empty photoIds array, returning empty result")
      return { success: true, data: [] }
    }

    console.log("[v0] [getBatchPhotoFacesAction] Calling FastAPI /api/faces/batch...")

    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/faces/batch", {
      method: "POST",
      headers,
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
    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/faces/batch-verify", {
      method: "POST",
      headers,
      body: JSON.stringify({
        photo_id: photoId,
        kept_faces: keptFaces,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        verified: result.data?.verified ?? 0,
        index_rebuilt: result.data?.index_rebuilt ?? false,
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
 * Batch assign multiple faces to a person.
 * Uses /api/faces/batch-assign endpoint that rebuilds index ONCE at the end.
 *
 * @param faceIds - Array of face IDs to assign
 * @param personId - Person ID to assign to
 */
export async function assignFacesToPersonAction(faceIds: string[], personId: string) {
  try {
    console.log("[assignFacesToPersonAction] Assigning", faceIds.length, "faces to person:", personId)

    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/faces/batch-assign", {
      method: "POST",
      headers,
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
