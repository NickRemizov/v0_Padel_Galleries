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
