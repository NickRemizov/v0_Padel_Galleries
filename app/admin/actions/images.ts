"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { apiFetch } from "@/lib/apiClient"

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
