"use server"

/**
 * People Photo Actions
 * 
 * Actions for managing person-photo relationships:
 * - getPersonPhotosWithDetailsAction
 * - verifyPersonOnPhotoAction
 * - batchVerifyPersonOnPhotosAction
 * - unlinkPersonFromPhotoAction
 */

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"

export async function getPersonPhotosWithDetailsAction(personId: string) {
  try {
    console.log("[getPersonPhotosWithDetailsAction] Fetching for person:", personId)
    const result = await apiFetch(`/api/people/${personId}/photos-with-details`)
    console.log("[getPersonPhotosWithDetailsAction] Result:", result.success, "data count:", result.data?.length)

    if (!result.success) {
      return { success: false, error: result.error || "Unknown error" }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[getPersonPhotosWithDetailsAction] Error:", error)
    return { success: false, error: error.message || "Failed to get person photos with details" }
  }
}

export async function verifyPersonOnPhotoAction(photoId: string, personId: string) {
  try {
    console.log("[verifyPersonOnPhotoAction] Verifying:", { photoId, personId })
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/people/${personId}/verify-on-photo?photo_id=${photoId}`, {
      method: "POST",
      headers,
    })
    console.log("[verifyPersonOnPhotoAction] Result:", result)

    if (!result.success) {
      console.error("[verifyPersonOnPhotoAction] Failed:", result.error)
      return { success: false, error: result.error || "Unknown error" }
    }

    revalidatePath("/admin")
    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[verifyPersonOnPhotoAction] Error:", error)
    return { success: false, error: error.message || "Failed to verify person" }
  }
}

/**
 * Batch verify person on multiple photos in a single request.
 * 
 * @param personId - Person ID to verify
 * @param photoIds - Array of photo IDs to verify on
 */
export async function batchVerifyPersonOnPhotosAction(personId: string, photoIds: string[]) {
  try {
    console.log("[batchVerifyPersonOnPhotosAction] Batch verifying:", { personId, photoCount: photoIds.length })
    
    if (photoIds.length === 0) {
      return { success: true, data: { verified_count: 0 } }
    }
    
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/people/${personId}/batch-verify-on-photos`, {
      method: "POST",
      headers,
      body: JSON.stringify({ photo_ids: photoIds }),
    })
    
    console.log("[batchVerifyPersonOnPhotosAction] Result:", result)

    if (!result.success) {
      console.error("[batchVerifyPersonOnPhotosAction] Failed:", result.error)
      return { success: false, error: result.error || "Unknown error" }
    }

    revalidatePath("/admin")
    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[batchVerifyPersonOnPhotosAction] Error:", error)
    return { success: false, error: error.message || "Failed to batch verify person" }
  }
}

export async function unlinkPersonFromPhotoAction(photoId: string, personId: string) {
  try {
    console.log("[unlinkPersonFromPhotoAction] Unlinking:", { photoId, personId })
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/people/${personId}/unlink-from-photo?photo_id=${photoId}`, {
      method: "POST",
      headers,
    })
    console.log("[unlinkPersonFromPhotoAction] Result:", result)

    if (!result.success) {
      console.error("[unlinkPersonFromPhotoAction] Failed:", result.error)
      return { success: false, error: result.error || "Unknown error" }
    }

    // Check if anything was actually unlinked
    const unlinkedCount = result.data?.unlinked_count ?? 0
    console.log("[unlinkPersonFromPhotoAction] Unlinked count:", unlinkedCount)

    revalidatePath("/admin")
    return { success: true, data: { unlinked_count: unlinkedCount } }
  } catch (error: any) {
    console.error("[unlinkPersonFromPhotoAction] Error:", error)
    return { success: false, error: error.message || "Failed to unlink person from photo" }
  }
}
