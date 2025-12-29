"use server"

/**
 * Gallery Images Actions
 * 
 * Actions for managing gallery images:
 * - deleteGalleryImageAction
 * - batchDeleteGalleryImagesAction
 * - deleteAllGalleryImagesAction
 * - addGalleryImagesAction
 */

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"

/**
 * Delete a gallery image and its associated faces
 * Backend returns: { success, data: { deleted, had_descriptors, index_rebuilt } }
 */
export async function deleteGalleryImageAction(photoId: string) {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/images/${photoId}`, {
      method: "DELETE",
      headers,
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        had_descriptors: result.data?.had_descriptors ?? false,
        index_rebuilt: result.data?.index_rebuilt ?? false,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to delete image",
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
 * Batch delete multiple gallery images in one request
 * Performance: O(1) instead of O(n) - single HTTP request, single index rebuild
 *
 * @param imageIds - Array of image IDs to delete
 * @param galleryId - Gallery ID
 */
export async function batchDeleteGalleryImagesAction(imageIds: string[], galleryId: string) {
  try {
    if (imageIds.length === 0) {
      return { success: true, deleted_count: 0 }
    }

    console.log(`[batchDeleteGalleryImagesAction] Deleting ${imageIds.length} images from gallery ${galleryId}`)

    const headers = await getAuthHeaders()
    // Use POST instead of DELETE - DELETE with body is unreliable
    const result = await apiFetch("/api/galleries/batch-delete-images", {
      method: "POST",
      headers,
      body: JSON.stringify({
        image_ids: imageIds,
        gallery_id: galleryId,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        deleted_count: result.data?.deleted_count ?? 0,
        had_verified_faces: result.data?.had_verified_faces ?? false,
        index_rebuilt: result.data?.index_rebuilt ?? false,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to delete images",
      }
    }
  } catch (error) {
    console.error("[batchDeleteGalleryImagesAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Delete all images from a gallery
 * Backend returns: { success, data: { deleted_count, failed_count, had_descriptors, index_rebuilt, message } }
 */
export async function deleteAllGalleryImagesAction(galleryId: string) {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/images/gallery/${galleryId}/all`, {
      method: "DELETE",
      headers,
    })

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        deleted_count: result.data?.deleted_count ?? 0,
        had_descriptors: result.data?.had_descriptors ?? false,
        index_rebuilt: result.data?.index_rebuilt ?? false,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to delete images",
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
 * Add multiple images to a gallery
 * Backend returns: { success, data: { inserted_count, message } }
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
    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/images/batch-add", {
      method: "POST",
      headers,
      body: JSON.stringify({
        galleryId,
        images: uploadedImages,
      }),
    })

    if (result.success) {
      revalidatePath("/admin")
      return { 
        success: true, 
        inserted_count: result.data?.inserted_count ?? 0 
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to add images",
      }
    }
  } catch (error) {
    console.error("[addGalleryImagesAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
