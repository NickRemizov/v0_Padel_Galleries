"use server"

import { apiFetch, ApiError } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"
import { revalidatePath } from "next/cache"

export async function getGalleriesAction(sortBy: "created_at" | "shoot_date" = "created_at") {
  try {
    return await apiFetch(`/api/galleries?sort_by=${sortBy}&with_relations=true&with_photo_count=true&public_only=false`)
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
    const is_public = formData.get("is_public") === "true"

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
      is_public,
    }

    // Add optional fields
    if (cover_image_url) data.cover_image_url = cover_image_url
    if (cover_image_square_url) data.cover_image_square_url = cover_image_square_url
    if (external_gallery_url) data.external_gallery_url = external_gallery_url
    if (photographer_id && photographer_id !== "none") data.photographer_id = photographer_id
    if (location_id && location_id !== "none") data.location_id = location_id
    if (organizer_id && organizer_id !== "none") data.organizer_id = organizer_id

    console.log("[addGalleryAction] Sending data:", data)

    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/galleries", {
      method: "POST",
      headers,
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

export async function updateGalleryAction(galleryId: string, formData: FormData) {
  try {
    // Convert FormData to object
    const title = formData.get("title") as string
    const shoot_date = formData.get("shoot_date") as string
    const cover_image_url = formData.get("cover_image_url") as string | null
    const cover_image_square_url = formData.get("cover_image_square_url") as string | null
    const external_gallery_url = formData.get("external_gallery_url") as string | null
    const photographer_id = formData.get("photographer_id") as string | null
    const location_id = formData.get("location_id") as string | null
    const organizer_id = formData.get("organizer_id") as string | null

    const data: Record<string, any> = {}

    // Add fields that are present
    if (title) data.title = title
    if (shoot_date) data.shoot_date = shoot_date
    if (cover_image_url) data.cover_image_url = cover_image_url
    if (cover_image_square_url) data.cover_image_square_url = cover_image_square_url
    if (external_gallery_url) data.external_gallery_url = external_gallery_url
    
    // Handle nullable foreign keys
    if (photographer_id !== null) {
      data.photographer_id = photographer_id === "none" ? null : photographer_id
    }
    if (location_id !== null) {
      data.location_id = location_id === "none" ? null : location_id
    }
    if (organizer_id !== null) {
      data.organizer_id = organizer_id === "none" ? null : organizer_id
    }

    console.log("[updateGalleryAction] Sending data:", data)

    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/galleries/${galleryId}`, {
      method: "PUT",
      headers,
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
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/galleries/${galleryId}/sort-order?sort_order=${encodeURIComponent(sortOrder)}`, {
      method: "PATCH",
      headers,
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
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/galleries/${galleryId}?delete_images=true`, {
      method: "DELETE",
      headers,
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

export async function renameGalleryFilesAction(galleryId: string) {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/galleries/${galleryId}/rename-files`, {
      method: "POST",
      headers,
    })
    if (result.success) revalidatePath("/admin")
    return result
  } catch (error) {
    console.error("[renameGalleryFilesAction] Error:", error)
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.code }
    }
    return { success: false, error: "Ошибка переименования файлов" }
  }
}
