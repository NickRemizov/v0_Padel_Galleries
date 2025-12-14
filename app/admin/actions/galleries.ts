"use server"

import { apiFetch } from "@/lib/apiClient"
import { revalidatePath } from "next/cache"

export async function getGalleriesAction(sortBy: "created_at" | "shoot_date" = "created_at") {
  return await apiFetch(`/api/galleries?sort_by=${sortBy}&with_relations=true&with_photo_count=true`)
}

export async function getGalleryAction(galleryId: string) {
  return await apiFetch(`/api/galleries/${galleryId}`)
}

export async function getGalleryFaceRecognitionStatsAction(galleryId: string) {
  return await apiFetch(`/api/galleries/${galleryId}/stats`)
}

export async function getGalleriesFaceRecognitionStatsAction(galleryIds: string[]) {
  // Batch request for multiple galleries via parallel API calls
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
  const result = await apiFetch("/api/galleries", {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function updateGalleryAction(galleryId: string, data: Record<string, any>) {
  const result = await apiFetch(`/api/galleries/${galleryId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function updateGallerySortOrderAction(galleryId: string, sortOrder: string) {
  const result = await apiFetch(`/api/galleries/${galleryId}/sort-order?sort_order=${encodeURIComponent(sortOrder)}`, {
    method: "PATCH",
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function deleteGalleryAction(galleryId: string) {
  const result = await apiFetch(`/api/galleries/${galleryId}?delete_images=true`, {
    method: "DELETE",
  })
  if (result.success) revalidatePath("/admin")
  return result
}
