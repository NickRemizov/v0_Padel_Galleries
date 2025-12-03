"use server"

import { revalidatePath } from "next/cache"
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

export async function saveFaceDescriptorAction(personId: string, embedding: number[], photoId: string) {
  console.warn("[saveFaceDescriptorAction] DEPRECATED: Use savePhotoFaceAction instead")
  return await savePhotoFaceAction(photoId, personId, null, embedding, null, null, true)
}
