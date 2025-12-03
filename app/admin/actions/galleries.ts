"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

export async function getGalleryFaceRecognitionStatsAction(galleryId: string) {
  try {
    const supabase = await createClient()

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
