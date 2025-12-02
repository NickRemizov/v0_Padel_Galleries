"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { apiFetch } from "@/lib/apiClient"

/**
 * Сохраняет распознанное лицо через FastAPI endpoint.
 * Автоматически перестраивает индекс для verified лиц.
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
        face_id: result.data?.id, // Backend возвращает data.id
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

/**
 * Удаляет одно фото через FastAPI endpoint.
 * Автоматически удаляет связанные photo_faces через CASCADE и перестраивает индекс.
 */
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
 * Удаляет ВСЕ фото из галереи через FastAPI endpoint.
 * Перестраивает индекс один раз после удаления всех фото.
 */
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

/**
 * Добавляет фотографии в существующую галерею.
 */
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
    const supabase = await createClient()

    const { data: maxOrderData } = await supabase
      .from("gallery_images")
      .select("display_order")
      .eq("gallery_id", galleryId)
      .order("display_order", { ascending: false })
      .limit(1)

    const startOrder = (maxOrderData?.[0]?.display_order || 0) + 1

    const imagesToInsert = uploadedImages.map((img, idx) => ({
      gallery_id: galleryId,
      image_url: img.imageUrl,
      original_url: img.originalUrl,
      original_filename: img.originalFilename,
      width: img.width,
      height: img.height,
      file_size: img.fileSize,
      display_order: startOrder + idx,
    }))

    const { error } = await supabase.from("gallery_images").insert(imagesToInsert)

    if (error) {
      throw error
    }

    revalidatePath("/admin")
    return { success: true }
  } catch (error) {
    console.error("[addGalleryImagesAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Получает статистику распознавания лиц для галереи.
 * Возвращает количество фото и информацию о распознанных/неизвестных лицах.
 */
export async function getGalleryFaceRecognitionStatsAction(galleryId: string) {
  try {
    const supabase = await createClient()

    // Получаем все фото в галерее
    const { data: images, error: imagesError } = await supabase
      .from("gallery_images")
      .select("id")
      .eq("gallery_id", galleryId)

    if (imagesError) throw imagesError

    const imageIds = images?.map((img) => img.id) || []

    if (imageIds.length === 0) {
      return {
        success: true,
        totalImages: 0,
        totalFaces: 0,
        recognizedFaces: 0,
        unknownFaces: 0,
      }
    }

    // Получаем статистику лиц
    const { data: faces, error: facesError } = await supabase
      .from("photo_faces")
      .select("id, person_id")
      .in("photo_id", imageIds)

    if (facesError) throw facesError

    const totalFaces = faces?.length || 0
    const recognizedFaces = faces?.filter((f) => f.person_id !== null).length || 0
    const unknownFaces = totalFaces - recognizedFaces

    return {
      success: true,
      totalImages: imageIds.length,
      totalFaces,
      recognizedFaces,
      unknownFaces,
    }
  } catch (error) {
    console.error("[getGalleryFaceRecognitionStatsAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      totalImages: 0,
      totalFaces: 0,
      recognizedFaces: 0,
      unknownFaces: 0,
    }
  }
}

/**
 * Получает все photo_faces для массива фотографий.
 * Используется для отображения информации о распознанных лицах в галерее.
 */
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

/**
 * Получает все photo_faces для одного фото.
 * Используется для проверки существующих тегов перед сохранением.
 */
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

/**
 * Удаляет одно лицо через FastAPI endpoint.
 * Автоматически перестраивает индекс если у лица были дескрипторы.
 */
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

/**
 * Обновляет существующее лицо через FastAPI endpoint.
 */
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

/**
 * Сохраняет face descriptor (старая функция для совместимости).
 * DEPRECATED: используйте savePhotoFaceAction вместо этого.
 */
export async function saveFaceDescriptorAction(personId: string, embedding: number[], photoId: string) {
  console.warn("[saveFaceDescriptorAction] DEPRECATED: Use savePhotoFaceAction instead")

  // Перенаправляем на новую функцию
  return await savePhotoFaceAction(
    photoId,
    personId,
    null, // bounding_box
    embedding,
    null, // detectionConfidence
    null, // recognitionConfidence
    true, // isVerified
  )
}

/**
 * Помечает фото как обработанное (has_been_processed=true).
 */
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
