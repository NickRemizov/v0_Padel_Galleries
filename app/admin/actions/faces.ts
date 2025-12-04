"use server"

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"

/**
 * Process photo for face detection and recognition
 * Backend handles embeddings internally
 */
export async function processPhotoAction(photoId: string) {
  try {
    const result = await apiFetch("/api/recognition/process-photo", {
      method: "POST",
      body: JSON.stringify({
        photo_id: photoId,
      }),
    })

    if (result.success) {
      return {
        success: true,
        faces: result.faces || [],
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
 * Verify face assignment (person_id + verified flag)
 * Backend reads embedding from database
 */
export async function verifyFaceAction(photoFaceId: string, personId: string | null, verified: boolean) {
  try {
    const result = await apiFetch("/api/faces/verify", {
      method: "POST",
      body: JSON.stringify({
        photo_face_id: photoFaceId,
        person_id: personId,
        verified: verified,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        face: result.face,
        index_updated: result.index_updated,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to verify face",
      }
    }
  } catch (error) {
    console.error("[verifyFaceAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Save new detected face with embedding
 * Backend generates and stores embedding
 */
export async function saveDetectedFaceAction(
  photoId: string,
  personId: string | null,
  boundingBox: { x: number; y: number; width: number; height: number },
  detectionConfidence: number,
  recognitionConfidence: number | null,
  verified: boolean,
  imageUrl: string,
) {
  try {
    const result = await apiFetch("/api/faces/save", {
      method: "POST",
      body: JSON.stringify({
        photo_id: photoId,
        person_id: personId,
        bounding_box: boundingBox,
        confidence: detectionConfidence,
        recognition_confidence: recognitionConfidence,
        verified: verified,
        image_url: imageUrl,
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
        error: result.error || "Failed to save face",
      }
    }
  } catch (error) {
    console.error("[saveDetectedFaceAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * @deprecated Use saveDetectedFaceAction instead (v2.2.0+)
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
  console.warn("[savePhotoFaceAction] DEPRECATED: Use saveDetectedFaceAction or verifyFaceAction instead (v2.2.0)")

  // Fallback для старого кода - просто игнорируем embedding
  if (!boundingBox) {
    return {
      success: false,
      error: "Bounding box is required",
    }
  }

  return await saveDetectedFaceAction(
    photoId,
    personId,
    boundingBox,
    detectionConfidence || 0,
    recognitionConfidence,
    isVerified,
    "", // imageUrl будет получен на backend
  )
}

/**
 * @deprecated Use verifyFaceAction instead (v2.2.0+)
 */
export async function saveFaceDescriptorAction(personId: string, embedding: number[], photoId: string) {
  console.warn("[saveFaceDescriptorAction] DEPRECATED: Use verifyFaceAction instead (v2.2.0)")
  return {
    success: false,
    error: "This action is deprecated. Use verifyFaceAction instead.",
  }
}
