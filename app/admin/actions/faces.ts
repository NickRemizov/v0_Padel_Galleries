"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { apiFetch } from "@/lib/apiClient"

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

export async function getPhotoFacesAction(photoId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("photo_faces")
      .select("*, people(id, first_name, last_name, nickname)")
      .eq("photo_id", photoId)

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[getPhotoFacesAction] Error:", error)
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function getBatchPhotoFacesAction(photoIds: string[]) {
  try {
    if (photoIds.length === 0) {
      return { success: true, data: [] }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("photo_faces")
      .select("*, people(id, first_name, last_name, nickname)")
      .in("photo_id", photoIds)

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[getBatchPhotoFacesAction] Error:", error)
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

export async function saveFaceDescriptorAction(personId: string, embedding: number[], photoId: string) {
  console.warn("[saveFaceDescriptorAction] DEPRECATED: Use savePhotoFaceAction instead")

  return await savePhotoFaceAction(photoId, personId, null, embedding, null, null, true)
}

export async function markPhotoAsProcessedAction(photoId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("gallery_images").update({ has_been_processed: true }).eq("id", photoId)

    if (error) throw error

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
