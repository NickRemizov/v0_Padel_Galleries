"use server"

import { apiFetch, ApiError } from "@/lib/apiClient"
import { revalidatePath } from "next/cache"

export async function getGalleriesAction(sortBy: "created_at" | "shoot_date" = "created_at") {
  try {
    return await apiFetch(`/api/galleries?sort_by=${sortBy}&with_relations=true&with_photo_count=true`)
  } catch (error) {
    console.error("[getGalleriesAction] Error:", error)
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.code }
    }
    return { success: false, error: "Ошибка загрузки галерей" }
  }
}

export async function getGalleryAction(galleryId: string) {
  try {
    return await apiFetch(`/api/galleries/${galleryId}`)
  } catch (error) {
    console.error("[getGalleryAction] Error:", error)
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.code }
    }
    return { success: false, error: "Ошибка загрузки галереи" }
  }
}

export async function getGalleryFaceRecognitionStatsAction(galleryId: string) {
  try {
    return await apiFetch(`/api/galleries/${galleryId}/stats`)
  } catch (error) {
    console.error("[getGalleryFaceRecognitionStatsAction] Error:", error)
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.code }
    }
    return { success: false, error: "Ошибка загрузки статистики" }
  }
}

export async function getGalleriesFaceRecognitionStatsAction(galleryIds: string[]) {
  try {
    const results = await Promise.all(galleryIds.map((id) => apiFetch(`/api/galleries/${id}/stats`)))

    return {
      success: true,
      data: galleryIds.reduce(
        (acc, id, idx) => {
          acc[id] = results[idx].success ? results[idx].data : null
          return acc
        },
        {} as Record<string, any>,
      ),
    }
  } catch (error) {
    console.error("[getGalleriesFaceRecognitionStatsAction] Error:", error)
    return { success: false, error: "Ошибка загрузки статистики", data: {} }
  }
}

export async function addGalleryAction(data: {
  title: string
  shoot_date: string
  gallery_url: string
  cover_image_url: string
  cover_image_square_url?: string
  external_gallery_url?: string
  photographer_id?: string
  location_id?: string
  organizer_id?: string
}) {
  try {
    const result = await apiFetch("/api/galleries", {
      method: "POST",
      body: JSON.stringify(data),
    })
    if (result.success) revalidatePath("/admin")
    return result
  } catch (error) {
    console.error("[addGalleryAction] Error:", error)
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.code }
    }
    return { success: false, error: "Ошибка создания галереи" }
  }
}

export async function updateGalleryAction(galleryId: string, data: Record<string, any>) {
  try {
    const result = await apiFetch(`/api/galleries/${galleryId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
    if (result.success) revalidatePath("/admin")
    return result
  } catch (error) {
    console.error("[updateGalleryAction] Error:", error)
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.code }
    }
    return { success: false, error: "Ошибка обновления галереи" }
  }
}

export async function updateGallerySortOrderAction(galleryId: string, sortOrder: string) {
  try {
    const result = await apiFetch(`/api/galleries/${galleryId}/sort-order?sort_order=${encodeURIComponent(sortOrder)}`, {
      method: "PATCH",
    })
    if (result.success) revalidatePath("/admin")
    return result
  } catch (error) {
    console.error("[updateGallerySortOrderAction] Error:", error)
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.code }
    }
    return { success: false, error: "Ошибка обновления сортировки" }
  }
}

export async function deleteGalleryAction(galleryId: string) {
  try {
    const result = await apiFetch(`/api/galleries/${galleryId}?delete_images=true`, {
      method: "DELETE",
    })
    if (result.success) revalidatePath("/admin")
    return result
  } catch (error) {
    console.error("[deleteGalleryAction] Error:", error)
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.code }
    }
    return { success: false, error: "Ошибка удаления галереи" }
  }
}
