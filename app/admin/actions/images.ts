"use server"

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"

export async function getGalleryImagesAction(galleryId: string) {
  return await apiFetch(`/api/images/gallery/${galleryId}`)
}

export async function updateGallerySortOrderAction(
  galleryId: string,
  imageOrders: Array<{ id: string; order: number }>,
) {
  try {
    const result = await apiFetch(`/api/images/gallery/${galleryId}/sort-order`, {
      method: "PATCH",
      body: JSON.stringify({ image_orders: imageOrders }),
    })

    if (result.error) {
      return { success: false, error: result.error }
    }

    revalidatePath("/admin")
    return { success: true }
  } catch (error) {
    console.error("[updateGallerySortOrderAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
