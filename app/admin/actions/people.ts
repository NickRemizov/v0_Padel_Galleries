"use server"

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"

// - getPersonPhotosAction (moved to entities.ts)
// - updatePersonAvatarAction (moved to entities.ts)
// - updatePersonVisibilityAction (moved to entities.ts)

export async function getPersonPhotosWithDetailsAction(personId: string) {
  try {
    const result = await apiFetch(`/api/people/${personId}/photos-with-details`)

    if (result.error) {
      return { success: false, error: result.error }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[getPersonPhotosWithDetailsAction] Error:", error)
    return { success: false, error: error.message || "Failed to get person photos with details" }
  }
}

export async function verifyPersonOnPhotoAction(photoId: string, personId: string) {
  try {
    const result = await apiFetch(`/api/people/${personId}/verify-on-photo?photo_id=${photoId}`, {
      method: "POST",
    })

    if (result.error) {
      return { success: false, error: result.error }
    }

    revalidatePath("/admin")
    return { success: true }
  } catch (error: any) {
    console.error("[verifyPersonOnPhotoAction] Error:", error)
    return { success: false, error: error.message || "Failed to verify person" }
  }
}

export async function unlinkPersonFromPhotoAction(photoId: string, personId: string) {
  try {
    const result = await apiFetch(`/api/people/${personId}/unlink-from-photo?photo_id=${photoId}`, {
      method: "POST",
    })

    if (result.error) {
      return { success: false, error: result.error }
    }

    revalidatePath("/admin")
    return { success: true }
  } catch (error: any) {
    console.error("[unlinkPersonFromPhotoAction] Error:", error)
    return { success: false, error: error.message || "Failed to unlink person from photo" }
  }
}
