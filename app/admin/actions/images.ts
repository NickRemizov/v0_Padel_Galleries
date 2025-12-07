"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { apiFetch } from "@/lib/apiClient"

export async function getGalleryImagesAction(galleryId: string) {
  return await apiFetch(`/api/images/gallery/${galleryId}`)
}

export async function updateGallerySortOrderAction(
  galleryId: string,
  imageOrders: Array<{ id: string; order: number }>,
) {
  try {
    const supabase = await createClient()

    for (const { id, order } of imageOrders) {
      const { error } = await supabase
        .from("gallery_images")
        .update({ display_order: order })
        .eq("id", id)
        .eq("gallery_id", galleryId)

      if (error) throw error
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
