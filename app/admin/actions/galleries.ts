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

export async function addGalleryAction(formData: FormData) {
  try {
    // Convert FormData to object
    const title = formData.get("title") as string
    const shoot_date = formData.get("shoot_date") as string
    const cover_image_url = formData.get("cover_image_url") as string
    const cover_image_square_url = formData.get("cover_image_square_url") as string | null
    const external_gallery_url = formData.get("external_gallery_url") as string | null
    const photographer_id = formData.get("photographer_id") as string | null
    const location_id = formData.get("location_id") as string | null
    const organizer_id = formData.get("organizer_id") as string | null

    // Generate gallery_url from title and date
    const slugifiedTitle = title
      .toLowerCase()
      .replace(/[^a-zа-яё0-9\s]/gi, "")
      .replace(/\s+/g, "-")
      .substring(0, 50)
    const gallery_url = `${shoot_date}-${slugifiedTitle}`

    const data: Record<string, any> = {
      title,
      shoot_date,
      gallery_url,
      cover_image_url,
    }

    // Add optional fields
    if (cover_image_square_url) data.cover_image_square_url = cover_image_square_url
    if (external_gallery_url) data.external_gallery_url = external_gallery_url
    if (photographer_id && photographer_id !== "none") data.photographer_id = photographer_id
    if (location_id && location_id !== "none") data.location_id = location_id
    if (organizer_id && organizer_id !== "none") data.organizer_id = organizer_id

    console.log("[addGalleryAction] Sending data:", data)

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
