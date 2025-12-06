"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

export async function getGalleriesFaceRecognitionStatsAction(galleryIds: string[]) {
  try {
    const supabase = await createClient()

    if (galleryIds.length === 0) {
      return {
        success: true,
        data: {},
      }
    }

    // Single optimized query: fetch all images for all galleries
    const { data: images, error: imagesError } = await supabase
      .from("gallery_images")
      .select("id, gallery_id")
      .in("gallery_id", galleryIds)

    if (imagesError) throw imagesError

    const imageIds = images?.map((img) => img.id) || []

    if (imageIds.length === 0) {
      return {
        success: true,
        data: {},
      }
    }

    // Single query: fetch all faces for all images
    const { data: faces, error: facesError } = await supabase
      .from("photo_faces")
      .select("photo_id, person_id, verified")
      .in("photo_id", imageIds)

    if (facesError) throw facesError

    // Group faces by photo_id
    const facesByPhoto: Record<string, { person_id: string | null; verified: boolean }[]> = {}

    for (const face of faces || []) {
      if (!facesByPhoto[face.photo_id]) {
        facesByPhoto[face.photo_id] = []
      }
      facesByPhoto[face.photo_id].push({
        person_id: face.person_id,
        verified: face.verified || false,
      })
    }

    // Group images by gallery_id
    const imagesByGallery: Record<string, string[]> = {}
    for (const image of images || []) {
      if (!imagesByGallery[image.gallery_id]) {
        imagesByGallery[image.gallery_id] = []
      }
      imagesByGallery[image.gallery_id].push(image.id)
    }

    // Calculate stats for each gallery
    const galleryStats: Record<string, { isFullyVerified: boolean; verifiedCount: number; totalCount: number }> = {}

    for (const galleryId of galleryIds) {
      const galleryImageIds = imagesByGallery[galleryId] || []
      const imageStatsArray = galleryImageIds.map((imageId) => {
        const imageFaces = facesByPhoto[imageId] || []
        const total = imageFaces.length
        const recognized = imageFaces.filter((f) => f.person_id !== null).length
        return {
          total,
          recognized,
          fullyRecognized: total > 0 && recognized === total,
        }
      })

      const hasImages = imageStatsArray.length > 0
      const allVerified = imageStatsArray.every((stat) => stat.fullyRecognized)
      const verifiedCount = imageStatsArray.filter((stat) => stat.fullyRecognized).length
      const totalCount = imageStatsArray.length

      galleryStats[galleryId] = {
        isFullyVerified: hasImages && allVerified,
        verifiedCount,
        totalCount,
      }
    }

    return {
      success: true,
      data: galleryStats,
    }
  } catch (error) {
    console.error("[getGalleriesFaceRecognitionStatsAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: {},
    }
  }
}

export async function getGalleryFaceRecognitionStatsAction(galleryId: string) {
  try {
    const supabase = await createClient()

    // Получаем все изображения галереи
    const { data: images, error: imagesError } = await supabase
      .from("gallery_images")
      .select("id")
      .eq("gallery_id", galleryId)

    if (imagesError) throw imagesError

    const imageIds = images?.map((img) => img.id) || []

    if (imageIds.length === 0) {
      return {
        success: true,
        data: {},
      }
    }

    // Получаем все лица для этих изображений
    const { data: faces, error: facesError } = await supabase
      .from("photo_faces")
      .select("photo_id, person_id, verified")
      .in("photo_id", imageIds)

    if (facesError) throw facesError

    // Группируем лица по photo_id
    const facesByPhoto: Record<string, { person_id: string | null; verified: boolean }[]> = {}

    for (const face of faces || []) {
      if (!facesByPhoto[face.photo_id]) {
        facesByPhoto[face.photo_id] = []
      }
      facesByPhoto[face.photo_id].push({
        person_id: face.person_id,
        verified: face.verified || false,
      })
    }

    // Вычисляем статистику для каждого изображения
    const stats: Record<string, { total: number; recognized: number; fullyRecognized: boolean }> = {}

    for (const imageId of imageIds) {
      const imageFaces = facesByPhoto[imageId] || []
      const total = imageFaces.length
      const recognized = imageFaces.filter((f) => f.person_id !== null).length
      const fullyRecognized = total > 0 && recognized === total

      stats[imageId] = {
        total,
        recognized,
        fullyRecognized,
      }
    }

    return {
      success: true,
      data: stats,
    }
  } catch (error) {
    console.error("[getGalleryFaceRecognitionStatsAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: {},
    }
  }
}

export async function addGalleryAction(data: {
  title: string
  description?: string
  shoot_date?: string
  photographer_id?: string
  location_id?: string
  organizer_id?: string
}) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("galleries").insert(data)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/galleries", "Gallery added successfully", { title: data.title })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/galleries", "Error adding gallery", error)
    return { error: error.message || "Failed to add gallery" }
  }
}

export async function updateGalleryAction(
  galleryId: string,
  data: {
    title?: string
    description?: string
    shoot_date?: string
    photographer_id?: string
    location_id?: string
    organizer_id?: string
  },
) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("galleries").update(data).eq("id", galleryId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/galleries", "Gallery updated successfully", { galleryId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/galleries", "Error updating gallery", error)
    return { error: error.message || "Failed to update gallery" }
  }
}

export async function deleteGalleryAction(galleryId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("galleries").delete().eq("id", galleryId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/galleries", "Gallery deleted successfully", { galleryId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/galleries", "Error deleting gallery", error)
    return { error: error.message || "Failed to delete gallery" }
  }
}
