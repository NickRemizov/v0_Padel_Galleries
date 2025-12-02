"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  getAllFaceDescriptors,
  saveFaceDescriptor,
  getPhotoFaces,
  deletePhotoFace,
  updatePhotoFace,
} from "@/lib/face-recognition/face-storage"
import { safeSupabaseCall } from "@/lib/supabase/safe-call"
import { apiFetch } from "@/lib/apiClient"
import { withSupabase } from "@/lib/supabase/with-supabase"
import { success, failure, type Result } from "@/lib/types"
import { logger } from "@/lib/logger"
import { env } from "@/lib/env"

export async function savePhotoFaceAction(
  photoId: string,
  personId: string | null,
  boundingBox: { x: number; y: number; width: number; height: number } | null,
  embedding: number[],
  confidence: number | null,
  recognitionConfidence: number | null,
  verified: boolean,
) {
  logger.debug("admin/actions", "SAVE PHOTO FACE ACTION STARTED")
  logger.debug("admin/actions", "savePhotoFaceAction called:", {
    photoId,
    personId,
    verified,
    hasEmbedding: embedding.length > 0,
  })

  // This ensures index is automatically updated when verified faces are saved
  try {
    const response = await fetch(`${env.FASTAPI_URL}/api/faces/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        photo_id: photoId,
        person_id: personId,
        bounding_box: boundingBox,
        embedding: embedding,
        confidence: confidence,
        recognition_confidence: recognitionConfidence,
        verified: verified,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to parse error" }))
      logger.error("admin/actions", "FastAPI error:", errorData)
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const result = await response.json()

    if (!result.success) {
      logger.error("admin/actions", "Failed to save face:", result.error)
      return {
        success: false,
        error: result.error,
      }
    }

    logger.info("admin/actions", "Face saved successfully:", {
      faceId: result.data?.id,
      indexUpdated: result.index_updated,
    })

    if (result.index_updated) {
      logger.info("admin/actions", "Recognition index automatically updated")
    }

    revalidatePath("/admin")

    return {
      success: true,
      data: result.data,
    }
  } catch (error) {
    logger.error("admin/actions", "Error calling FastAPI:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function signInAction(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  logger.debug("admin/actions", `Sign in attempt for: ${email}`)

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    logger.warn("admin/actions", `Sign in error for ${email}:`, error.message)
    return { error: error.message }
  }

  logger.info("admin/actions", `Sign in successful for ${email}`)
  revalidatePath("/admin", "layout")
  redirect("/admin")
}

export async function signUpAction(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  logger.debug("admin/actions", `Sign up attempt for: ${email}`)

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo:
        process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/admin`,
      data: {
        email_confirm: false,
      },
    },
  })

  if (error) {
    logger.warn("admin/actions", `Sign up error for ${email}:`, error.message)
    return { error: error.message }
  }

  logger.info("admin/actions", `Sign up successful for ${email}`)
  return { success: true }
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/admin/login")
}

export async function addGalleryAction(formData: FormData): Promise<Result<void>> {
  return withSupabase(async (supabase) => {
    const title = formData.get("title") as string
    const shootDate = formData.get("shoot_date") as string
    const galleryUrl = (formData.get("gallery_url") as string) || ""
    const externalGalleryUrl = (formData.get("external_gallery_url") as string) || null
    const coverImageUrl = formData.get("cover_image_url") as string
    const coverImageSquareUrl = (formData.get("cover_image_square_url") as string) || null
    const photographerId = formData.get("photographer_id") as string
    const locationId = formData.get("location_id") as string
    const organizerId = formData.get("organizer_id") as string

    logger.debug("admin/actions", "Adding new gallery", { title, shootDate })

    const { error } = await supabase.from("galleries").insert({
      title,
      shoot_date: shootDate,
      gallery_url: galleryUrl,
      external_gallery_url: externalGalleryUrl,
      cover_image_url: coverImageUrl,
      cover_image_square_url: coverImageSquareUrl,
      photographer_id: photographerId && photographerId !== "none" ? photographerId : null,
      location_id: locationId && locationId !== "none" ? locationId : null,
      organizer_id: organizerId && organizerId !== "none" ? organizerId : null,
    })

    if (error) {
      logger.error("admin/actions", "Error adding gallery", error)
      return failure(error.message)
    }

    revalidatePath("/")
    revalidatePath("/admin")
    logger.info("admin/actions", "Gallery added successfully", { title })
    return success(undefined)
  })
}

export async function updateGalleryAction(id: string, formData: FormData): Promise<Result<void>> {
  return withSupabase(async (supabase) => {
    const title = formData.get("title") as string
    const shootDate = formData.get("shoot_date") as string
    const galleryUrl = (formData.get("gallery_url") as string) || ""
    const externalGalleryUrl = (formData.get("external_gallery_url") as string) || null
    const coverImageUrl = formData.get("cover_image_url") as string
    const coverImageSquareUrl = (formData.get("cover_image_square_url") as string) || null
    const photographerId = formData.get("photographer_id") as string
    const locationId = formData.get("location_id") as string
    const organizerId = formData.get("organizer_id") as string

    logger.debug("admin/actions", "Updating gallery", { id, title })

    const { error } = await supabase
      .from("galleries")
      .update({
        title,
        shoot_date: shootDate,
        gallery_url: galleryUrl,
        external_gallery_url: externalGalleryUrl,
        cover_image_url: coverImageUrl,
        cover_image_square_url: coverImageSquareUrl,
        photographer_id: photographerId === "none" ? null : photographerId,
        location_id: locationId === "none" ? null : locationId,
        organizer_id: organizerId === "none" ? null : organizerId,
      })
      .eq("id", id)

    if (error) {
      logger.error("admin/actions", "Error updating gallery", error)
      return failure(error.message)
    }

    revalidatePath("/")
    revalidatePath("/admin")
    logger.info("admin/actions", "Gallery updated successfully", { id, title })
    return success(undefined)
  })
}

export async function deleteGalleryAction(id: string): Promise<Result<void>> {
  return withSupabase(async (supabase) => {
    logger.debug("admin/actions", "Deleting gallery", { id })

    const { error } = await supabase.from("galleries").delete().eq("id", id)

    if (error) {
      logger.error("admin/actions", "Error deleting gallery", error)
      return failure(error.message)
    }

    revalidatePath("/")
    revalidatePath("/admin")
    logger.info("admin/actions", "Gallery deleted successfully", { id })
    return success(undefined)
  })
}

export async function addPhotographerAction(formData: FormData) {
  const supabase = await createClient()

  const name = formData.get("name") as string

  const { error } = await supabase.from("photographers").insert({ name })

  if (error) {
    logger.error("admin/actions", "Error adding photographer", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Photographer added successfully", { name })
  return { success: true }
}

export async function updatePhotographerAction(id: string, formData: FormData) {
  const supabase = await createClient()

  const name = formData.get("name") as string

  const { error } = await supabase.from("photographers").update({ name }).eq("id", id)

  if (error) {
    logger.error("admin/actions", "Error updating photographer", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Photographer updated successfully", { id, name })
  return { success: true }
}

export async function deletePhotographerAction(id: string) {
  const supabase = await createClient()

  const { error } = await supabase.from("photographers").delete().eq("id", id)

  if (error) {
    logger.error("admin/actions", "Error deleting photographer", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Photographer deleted successfully", { id })
  return { success: true }
}

export async function addLocationAction(formData: FormData) {
  const supabase = await createClient()

  const name = formData.get("name") as string

  const { error } = await supabase.from("locations").insert({ name })

  if (error) {
    logger.error("admin/actions", "Error adding location", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Location added successfully", { name })
  return { success: true }
}

export async function updateLocationAction(id: string, formData: FormData) {
  const supabase = await createClient()

  const name = formData.get("name") as string

  const { error } = await supabase.from("locations").update({ name }).eq("id", id)

  if (error) {
    logger.error("admin/actions", "Error updating location", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Location updated successfully", { id, name })
  return { success: true }
}

export async function deleteLocationAction(id: string) {
  const supabase = await createClient()

  const { error } = await supabase.from("locations").delete().eq("id", id)

  if (error) {
    logger.error("admin/actions", "Error deleting location", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Location deleted successfully", { id })
  return { success: true }
}

export async function addOrganizerAction(formData: FormData) {
  const supabase = await createClient()

  const name = formData.get("name") as string

  const { error } = await supabase.from("organizers").insert({ name })

  if (error) {
    logger.error("admin/actions", "Error adding organizer", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Organizer added successfully", { name })
  return { success: true }
}

export async function updateOrganizerAction(id: string, formData: FormData) {
  const supabase = await createClient()

  const name = formData.get("name") as string

  const { error } = await supabase.from("organizers").update({ name }).eq("id", id)

  if (error) {
    logger.error("admin/actions", "Error updating organizer", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Organizer updated successfully", { id, name })
  return { success: true }
}

export async function deleteOrganizerAction(id: string) {
  const supabase = await createClient()

  const { error } = await supabase.from("organizers").delete().eq("id", id)

  if (error) {
    logger.error("admin/actions", "Error deleting organizer", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Organizer deleted successfully", { id })
  return { success: true }
}

export async function addGalleryImagesAction(
  galleryId: string,
  imageUrls: {
    imageUrl: string
    originalUrl: string
    originalFilename: string
    fileSize: number
    width: number
    height: number
  }[],
) {
  const supabase = await createClient()

  const imagesToInsert = imageUrls.map((img, index) => ({
    gallery_id: galleryId,
    image_url: img.imageUrl,
    original_url: img.originalUrl,
    original_filename: img.originalFilename,
    file_size: img.fileSize,
    width: img.width,
    height: img.height,
    display_order: index,
  }))

  // </CHANGE> Fixed typo: imagesToToInsert → imagesToInsert
  const { error } = await supabase.from("gallery_images").insert(imagesToInsert)

  if (error) {
    logger.error("admin/actions", "Error adding gallery images", error)
    return { error: error.message }
  }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin")
  logger.info("admin/actions", "Gallery images added successfully", { galleryId, count: imageUrls.length })
  return { success: true }
}

export async function deleteGalleryImageAction(imageId: string, galleryId: string) {
  const supabase = await createClient()

  const { data: verifiedFaces } = await supabase
    .from("photo_faces")
    .select("id")
    .eq("photo_id", imageId)
    .eq("verified", true)

  const hasVerifiedFaces = verifiedFaces && verifiedFaces.length > 0

  // This ensures cleanup even if CASCADE doesn't work properly
  const { error: descriptorError } = await supabase.from("face_descriptors").delete().eq("source_image_id", imageId)

  if (descriptorError) {
    logger.error("admin/actions", "Error deleting face descriptors", descriptorError)
  } else {
    logger.debug("admin/actions", "Deleted face descriptors for image", imageId)
  }

  // Delete photo_faces records (should cascade, but being explicit)
  const { error: facesError } = await supabase.from("photo_faces").delete().eq("photo_id", imageId)

  if (facesError) {
    logger.error("admin/actions", "Error deleting photo faces", facesError)
  } else {
    logger.debug("admin/actions", "Deleted photo_faces for image", imageId)
  }

  // Finally delete the image itself
  const { error } = await supabase.from("gallery_images").delete().eq("id", imageId)

  if (error) {
    logger.error("admin/actions", "Error deleting gallery image", error)
    return { error: error.message }
  }

  if (hasVerifiedFaces) {
    logger.info("admin/actions", "Rebuilding recognition index after deleting verified faces")
    await rebuildRecognitionIndexAction()
  }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin")
  logger.info("admin/actions", "Gallery image deleted successfully", { imageId, galleryId })
  return { success: true }
}

export async function deleteAllGalleryImagesAction(galleryId: string) {
  const supabase = await createClient()

  if (!supabase) {
    logger.error("admin/actions", "Supabase client is null")
    return { error: "Database connection failed" }
  }

  try {
    // Get all images first
    const { data: images, error: fetchError } = await supabase
      .from("gallery_images")
      .select("id")
      .eq("gallery_id", galleryId)

    if (fetchError) {
      logger.error("admin/actions", "Error fetching gallery images", fetchError)
      return { error: fetchError.message }
    }

    if (!images || images.length === 0) {
      logger.info("admin/actions", "No images to delete for gallery", galleryId)
      return { success: true }
    }

    const imageIds = images.map((img) => img.id)
    logger.debug(
      "admin/actions",
      `Starting deletion of ${imageIds.length} images and related data for gallery`,
      galleryId,
    )

    // Delete in correct order to avoid FK violations
    // 1. Delete face_descriptors (references gallery_images)
    const { error: descriptorError } = await supabase.from("face_descriptors").delete().in("source_image_id", imageIds)

    if (descriptorError) {
      logger.error("admin/actions", "Error deleting face descriptors", descriptorError)
      return { error: `Failed to delete face descriptors: ${descriptorError.message}` }
    }
    logger.debug("admin/actions", `Deleted face descriptors for ${imageIds.length} images`)

    // 2. Delete photo_faces (references gallery_images)
    const { error: facesError } = await supabase.from("photo_faces").delete().in("photo_id", imageIds)

    if (facesError) {
      logger.error("admin/actions", "Error deleting photo faces", facesError)
      return { error: `Failed to delete photo faces: ${facesError.message}` }
    }
    logger.debug("admin/actions", `Deleted photo_faces for ${imageIds.length} images`)

    // 3. Finally delete gallery_images
    const { error: imagesError } = await supabase.from("gallery_images").delete().eq("gallery_id", galleryId)

    if (imagesError) {
      logger.error("admin/actions", "Error deleting gallery images", imagesError)
      return { error: `Failed to delete images: ${imagesError.message}` }
    }
    logger.info("admin/actions", `Successfully deleted all ${imageIds.length} images for gallery`, galleryId)

    revalidatePath(`/gallery/${galleryId}`)
    revalidatePath("/admin")

    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Unexpected error in deleteAllGalleryImagesAction", error)
    return { error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export async function updateGalleryImageOrderAction(galleryId: string, imageOrders: { id: string; order: number }[]) {
  const supabase = await createClient()

  for (const item of imageOrders) {
    const { error } = await supabase.from("gallery_images").update({ display_order: item.order }).eq("id", item.id)

    if (error) {
      logger.error("admin/actions", "Error updating image order", error)
      return { error: error.message }
    }
  }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin")
  logger.info("admin/actions", "Gallery image order updated successfully", { galleryId, count: imageOrders.length })
  return { success: true }
}

export async function updateGallerySortOrderAction(galleryId: string, sortOrder: string) {
  const supabase = await createClient()

  const { error } = await supabase.from("galleries").update({ sort_order: sortOrder }).eq("id", galleryId)

  if (error) {
    logger.error("admin/actions", "Error updating gallery sort order", error)
    return { error: error.message }
  }

  revalidatePath(`/gallery/${galleryId}`)
  revalidatePath("/admin")
  logger.info("admin/actions", "Gallery sort order updated successfully", { galleryId, sortOrder })
  return { success: true }
}

export async function addPersonAction(formData: FormData) {
  const supabase = await createClient()

  const realName = formData.get("real_name") as string
  const telegramName = (formData.get("telegram_name") as string) || null
  const telegramNickname = (formData.get("telegram_nickname") as string) || null
  const telegramProfileUrl = (formData.get("telegram_profile_url") as string) || null
  const facebookProfileUrl = (formData.get("facebook_profile_url") as string) || null
  const instagramProfileUrl = (formData.get("instagram_profile_url") as string) || null
  const paddleRanking = formData.get("paddle_ranking")
    ? Number.parseInt(formData.get("paddle_ranking") as string)
    : null
  const avatarUrl = (formData.get("avatar_url") as string) || null

  const { data: person, error } = await supabase
    .from("people")
    .insert({
      real_name: realName,
      telegram_name: telegramName,
      telegram_nickname: telegramNickname,
      telegram_profile_url: telegramProfileUrl,
      facebook_profile_url: facebookProfileUrl,
      instagram_profile_url: instagramProfileUrl,
      paddle_ranking: paddleRanking,
      avatar_url: avatarUrl,
    })
    .select()
    .single()

  if (error) {
    logger.error("admin/actions", "Error adding person", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Person added successfully", { id: person.id, name: person.real_name })
  return { success: true, data: person }
}

export async function updatePersonAction(id: string, formData: FormData) {
  const supabase = await createClient()

  const realName = formData.get("real_name") as string
  const telegramName = (formData.get("telegram_name") as string) || null
  const telegramNickname = (formData.get("telegram_nickname") as string) || null
  const telegramProfileUrl = (formData.get("telegram_profile_url") as string) || null
  const facebookProfileUrl = (formData.get("facebook_profile_url") as string) || null
  const instagramProfileUrl = (formData.get("instagram_profile_url") as string) || null
  const paddleRanking = formData.get("paddle_ranking")
    ? Number.parseInt(formData.get("paddle_ranking") as string)
    : null
  const tournamentResultsStr = (formData.get("tournament_results") as string) || "[]"

  let tournamentResults = []
  try {
    tournamentResults = JSON.parse(tournamentResultsStr)
  } catch (e) {
    logger.error("admin/actions", "Error parsing tournament results", e)
    return { error: "Invalid JSON format for tournament results" }
  }

  const { error } = await supabase
    .from("people")
    .update({
      real_name: realName,
      telegram_name: telegramName,
      telegram_nickname: telegramNickname,
      telegram_profile_url: telegramProfileUrl,
      facebook_profile_url: facebookProfileUrl,
      instagram_profile_url: instagramProfileUrl,
      paddle_ranking: paddleRanking,
      tournament_results: tournamentResults,
      // avatar_url removed - it will be preserved
    })
    .eq("id", id)

  if (error) {
    logger.error("admin/actions", "Error updating person", error)
    return { error: error.message }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Person updated successfully", { id, realName })
  return { success: true }
}

export async function deletePersonAction(id: string) {
  const supabase = await createClient()

  if (!supabase) {
    logger.error("admin/actions", "Supabase client is null")
    return { error: "Database connection failed" }
  }

  const { error: descriptorError } = await supabase.from("face_descriptors").delete().eq("person_id", id)

  if (descriptorError) {
    logger.error("admin/actions", "Error deleting face descriptors", descriptorError)
    return { error: descriptorError.message }
  }

  logger.debug("admin/actions", `Deleted face_descriptors for person ${id}`)

  // Reset photo_faces references
  const { error: updateError } = await supabase
    .from("photo_faces")
    .update({
      person_id: null,
      verified: false,
      recognition_confidence: null,
    })
    .eq("person_id", id)

  if (updateError) {
    logger.error("admin/actions", "Error resetting photo_faces for deleted person", updateError)
    return { error: updateError.message }
  }

  logger.debug("admin/actions", `Reset person_id, verified, and recognition_confidence for all faces of person ${id}`)

  // Delete the person record
  const { error } = await supabase.from("people").delete().eq("id", id)

  if (error) {
    logger.error("admin/actions", "Error deleting person", error)
    return { error: error.message }
  }

  logger.info("admin/actions", `Triggering recognition index rebuild after person deletion for ID: ${id}`)
  const rebuildResult = await rebuildRecognitionIndexAction()

  if (rebuildResult.error) {
    logger.warn("admin/actions", `Failed to rebuild index after person deletion for ID: ${id}`, rebuildResult.error)
  } else {
    logger.info(
      "admin/actions",
      `Index rebuilt successfully after person deletion for ID: ${id}`,
      rebuildResult.message,
    )
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Person deleted successfully", { id })
  return { success: true }
}

export async function saveFaceTagsAction(
  photoId: string,
  tags: {
    personId: string | null
    boundingBox: { x: number; y: number; width: number; height: number }
    embedding?: number[]
    confidence: number | null
    verified: boolean
  }[],
) {
  const supabase = await createClient()

  // Delete existing tags
  await supabase.from("photo_faces").delete().eq("photo_id", photoId)

  const tagsToInsert = tags.map((tag) => {
    const insertData: any = {
      photo_id: photoId,
      person_id: tag.personId,
      insightface_bbox: tag.boundingBox,
      confidence: tag.confidence,
      verified: tag.verified,
    }

    if (tag.embedding && tag.embedding.length > 0) {
      const vectorString = `[${tag.embedding.join(",")}]`
      insertData.insightface_descriptor = vectorString
    }

    return insertData
  })

  const { error } = await supabase.from("photo_faces").insert(tagsToInsert)

  if (error) {
    logger.error("admin/actions", "Error saving face tags", error)
    return { error: error.message }
  }

  const hasVerifiedFaces = tags.some((tag) => tag.verified && tag.personId && tag.embedding && tag.embedding.length > 0)
  if (hasVerifiedFaces) {
    logger.info("admin/actions", "Verified faces saved, rebuilding recognition index...")
    try {
      await rebuildRecognitionIndexAction()
      logger.info("admin/actions", "Index rebuilt successfully")
    } catch (indexError) {
      logger.error("admin/actions", "Error rebuilding index", indexError)
    }
  }

  revalidatePath("/admin")
  logger.info("admin/actions", "Face tags saved successfully", { photoId, tagCount: tags.length })
  return { success: true }
}

export async function getAllFaceDescriptorsAction() {
  const supabase = await createClient()

  try {
    const descriptors = await getAllFaceDescriptors(supabase)
    return { success: true, data: descriptors }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting face descriptors", error)
    return { error: error.message || "Failed to get face descriptors" }
  }
}

export async function saveFaceDescriptorAction(personId: string, descriptor: number[], sourceImageId: string | null) {
  const supabase = await createClient()

  try {
    await saveFaceDescriptor(supabase, personId, new Float32Array(descriptor), sourceImageId)
    logger.info("admin/actions", "Face descriptor saved successfully", { personId, sourceImageId })
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error saving face descriptor", error)
    return { error: error.message || "Failed to save face descriptor" }
  }
}

export async function getPhotoFacesAction(photoId: string) {
  const supabase = await createClient()

  try {
    const faces = await getPhotoFaces(supabase, photoId)
    return { success: true, data: faces }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting photo faces", error)
    return { error: error.message || "Failed to get photo faces" }
  }
}

export async function getBatchPhotoFacesAction(photoIds: string[]) {
  const supabase = await createClient()

  try {
    const { data: faces, error } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, insightface_bbox, recognition_confidence, verified, people(id, real_name)")
      .in("photo_id", photoIds)

    if (error) throw error

    logger.debug("admin/actions", `Fetched ${faces?.length || 0} photo faces for batch request`)
    return { success: true, data: faces }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting batch photo faces", error)
    return { success: false, error: error.message || "Failed to get batch photo faces" }
  }
}

export async function deletePhotoFaceAction(faceId: string) {
  const supabase = await createClient()

  try {
    const { data: face } = await supabase.from("photo_faces").select("verified").eq("id", faceId).single()

    const wasVerified = face?.verified === true

    await deletePhotoFace(supabase, faceId)

    if (wasVerified) {
      logger.info("admin/actions", "Rebuilding recognition index after deleting verified face", { faceId })
      await rebuildRecognitionIndexAction()
    }

    revalidatePath("/admin")
    logger.info("admin/actions", "Photo face deleted successfully", { faceId, wasVerified })
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error deleting photo face", error)
    return { error: error.message || "Failed to delete photo face" }
  }
}

export async function updatePhotoFaceAction(
  faceId: string,
  updates: {
    person_id?: string | null
    confidence?: number | null
    verified?: boolean
  },
) {
  const supabase = await createClient()

  try {
    await updatePhotoFace(supabase, faceId, updates)
    revalidatePath("/admin")
    logger.info("admin/actions", "Photo face updated successfully", { faceId, updates })
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error updating photo face", error)
    return { error: error.message || "Failed to update photo face" }
  }
}

export async function getGalleryFaceRecognitionStatsAction(galleryId: string) {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Getting face recognition stats for gallery", galleryId)

    // Get all images for the gallery
    const imagesResult = await safeSupabaseCall(() =>
      supabase.from("gallery_images").select("id").eq("gallery_id", galleryId),
    )

    if (imagesResult.error) throw imagesResult.error
    if (!imagesResult.data) return { success: true, data: {} }

    const images = imagesResult.data
    logger.debug("admin/actions", "Found images", images.length)

    // Get all photo faces for these images
    const imageIds = images.map((img) => img.id)

    if (imageIds.length === 0) {
      return { success: true, data: {} }
    }

    const facesResult = await safeSupabaseCall(() =>
      supabase.from("photo_faces").select("photo_id, person_id, confidence, verified").in("photo_id", imageIds),
    )

    const facesError = facesResult.error // Declare facesError here
    if (facesError) throw facesError
    const faces = facesResult.data || []
    logger.debug("admin/actions", "Found photo faces", faces.length)

    // Calculate stats for each image
    const stats: Record<string, { total: number; recognized: number; fullyRecognized: boolean }> = {}

    for (const image of images) {
      const imageFaces = faces.filter((f) => f.photo_id === image.id)
      const recognizedFaces = imageFaces.filter((f) => f.person_id && f.verified)

      stats[image.id] = {
        total: imageFaces.length,
        recognized: recognizedFaces.length,
        fullyRecognized: imageFaces.length > 0 && imageFaces.length === recognizedFaces.length,
      }

      if (imageFaces.length > 0) {
        logger.debug(
          "admin/actions",
          `Image ${image.id}: ${recognizedFaces.length}/${imageFaces.length} faces verified, fully: ${stats[image.id].fullyRecognized}`,
        )
      }
    }

    logger.debug("admin/actions", "Stats calculated for", Object.keys(stats).length, "images")
    return { success: true, data: stats }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting face recognition stats", error)
    return { error: error.message || "Failed to get face recognition stats" }
  }
}

export async function getPersonPhotosAction(personId: string) {
  const supabase = await createClient()

  try {
    const { data: photoFaces, error } = await supabase
      .from("photo_faces")
      .select("photo_id, person_id, verified, confidence, gallery_images(id, image_url, gallery_id, width, height)")
      .eq("person_id", personId)
      .or(`verified.eq.true,confidence.gte.0.6`)

    if (error) throw error

    const photos = (photoFaces || [])
      .map((pf: any) => pf.gallery_images)
      .filter((img: any) => img !== null)
      .filter((img: any, index: number, self: any[]) => self.findIndex((i: any) => i.id === img.id) === index)

    logger.debug("admin/actions", `Found ${photos?.length || 0} photos for person ${personId}`)
    return { success: true, data: photos || [] }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting person photos", error)
    return { error: error.message || "Failed to get person photos" }
  }
}

export async function updatePersonAvatarAction(personId: string, avatarUrl: string) {
  const supabase = await createClient()

  try {
    const { error } = await supabase.from("people").update({ avatar_url: avatarUrl }).eq("id", personId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("admin/actions", "Person avatar updated successfully", { personId, avatarUrl })
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error updating person avatar", error)
    return { error: error.message || "Failed to update person avatar" }
  }
}

export async function getRecognitionStatsAction() {
  const supabase = await createClient()

  if (!supabase) {
    logger.error("admin/actions", "Supabase client is null")
    return { error: "Database connection failed" }
  }

  logger.debug("admin/actions", "[getRecognitionStatsAction] Starting...")

  try {
    const { count: peopleCount, error: peopleError } = await supabase
      .from("people")
      .select("*", { count: "exact", head: true })

    if (peopleError) throw peopleError
    logger.debug("admin/actions", `Total people: ${peopleCount}`)

    let allPhotoFaces: any[] = []
    let hasMore = true
    let offset = 0
    const pageSize = 1000

    while (hasMore) {
      const { data: batch, error: batchError } = await supabase
        .from("photo_faces")
        .select("photo_id, person_id, verified, confidence")
        .range(offset, offset + pageSize - 1)

      if (batchError) throw batchError

      if (batch && batch.length > 0) {
        allPhotoFaces = allPhotoFaces.concat(batch)
        offset += pageSize
        hasMore = batch.length === pageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allPhotoFaces.length} photo_faces records total`)

    const verifiedCount = allPhotoFaces.filter((pf) => pf.verified).length
    const highConfidenceCount = allPhotoFaces.filter(
      (pf) => pf.confidence && pf.confidence >= 0.6 && !pf.verified,
    ).length

    logger.debug("admin/actions", `Total verified faces: ${verifiedCount}`)
    logger.debug("admin/actions", `Total high confidence (not verified) faces: ${highConfidenceCount}`)

    const { count: descriptorsCount, error: descriptorsError } = await supabase
      .from("face_descriptors")
      .select("*", { count: "exact", head: true })

    if (descriptorsError) throw descriptorsError
    logger.debug("admin/actions", `Total descriptors: ${descriptorsCount}`)

    const { data: peopleData, error: peopleDataError } = await supabase
      .from("people")
      .select("id, real_name, telegram_name")
      .order("real_name")

    if (peopleDataError) throw peopleDataError
    logger.debug("admin/actions", `Processing ${peopleData?.length || 0} people`)

    const facesByPerson = new Map<string, any[]>()
    for (const face of allPhotoFaces) {
      if (!face.person_id) continue
      if (!facesByPerson.has(face.person_id)) {
        facesByPerson.set(face.person_id, [])
      }
      facesByPerson.get(face.person_id)!.push(face)
    }

    const peopleIds = (peopleData || []).map((p) => p.id)
    const { data: allDescriptors, error: allDescError } = await supabase
      .from("face_descriptors")
      .select("person_id")
      .in("person_id", peopleIds)

    if (allDescError) {
      logger.warn("admin/actions", "Error fetching descriptors", allDescError)
    }

    const descriptorCountsMap = new Map<string, number>()
    if (allDescriptors) {
      for (const desc of allDescriptors) {
        descriptorCountsMap.set(desc.person_id, (descriptorCountsMap.get(desc.person_id) || 0) + 1)
      }
    }

    logger.debug("admin/actions", `Built descriptor counts map for ${descriptorCountsMap.size} people`)

    const peopleStats = []
    for (const person of peopleData || []) {
      const photoFaces = facesByPerson.get(person.id) || []

      const verifiedPhotoIds = new Set(photoFaces.filter((pf) => pf.verified).map((pf) => pf.photo_id))

      const highConfPhotoIds = new Set(
        photoFaces.filter((pf) => pf.confidence && pf.confidence >= 0.6 && !pf.verified).map((pf) => pf.photo_id),
      )

      const totalConfirmed = verifiedPhotoIds.size + highConfPhotoIds.size

      const personDescCount = descriptorCountsMap.get(person.id) || 0

      peopleStats.push({
        id: person.id,
        name: person.real_name,
        telegramName: person.telegram_name,
        verifiedPhotos: verifiedPhotoIds.size,
        highConfidencePhotos: highConfPhotoIds.size,
        descriptors: personDescCount,
        totalConfirmed: totalConfirmed,
      })
    }

    peopleStats.sort((a, b) => b.totalConfirmed - a.totalConfirmed)

    logger.debug("admin/actions", "Completed getRecognitionStatsAction successfully")

    return {
      success: true,
      data: {
        summary: {
          totalPeople: peopleCount || 0,
          totalVerifiedFaces: verifiedCount,
          totalHighConfidenceFaces: highConfidenceCount,
          totalDescriptors: descriptorsCount || 0,
        },
        peopleStats: peopleStats,
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting recognition stats", error)
    return { error: error.message || "Failed to get recognition stats" }
  }
}

export async function getPersonPhotosWithDetailsAction(personId: string) {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", " ===== getPersonPhotosWithDetailsAction START =====")
    logger.debug("admin/actions", "Querying photos for person_id:", personId)

    const photoFacesResult = await safeSupabaseCall(() =>
      supabase
        .from("photo_faces")
        .select(
          "id, photo_id, confidence, verified, insightface_bbox, person_id, gallery_images(id, image_url, gallery_id, width, height, original_filename, galleries(shoot_date, title))",
        )
        .eq("person_id", personId),
    )

    if (photoFacesResult.error) throw photoFacesResult.error

    const allPhotoFaces_ = photoFacesResult.data || []
    // For unverified photos, only show if confidence >= 0.6
    const photoFaces = allPhotoFaces_.filter((pf) => {
      if (pf.verified === true) return true // Always show verified photos
      return pf.confidence && pf.confidence >= 0.6 // Only show unverified if confidence is high
    })

    logger.debug(
      "admin/actions",
      `Found ${allPhotoFaces_.length} total photo_faces, ${photoFaces.length} after filtering`,
    )
    photoFaces.forEach((pf, index) => {
      logger.debug("admin/actions", `PhotoFace ${index + 1}:`, {
        id: pf.id,
        photo_id: pf.photo_id,
        person_id: pf.person_id,
        verified: pf.verified,
        confidence: pf.confidence,
        filename: pf.gallery_images?.original_filename,
      })
    })

    const photosMap = new Map()

    const facesByPhotoForPerson = new Map<string, any[]>()
    for (const pf of photoFaces) {
      if (!pf.gallery_images) continue
      const photoId = pf.gallery_images.id

      if (!facesByPhotoForPerson.has(photoId)) {
        facesByPhotoForPerson.set(photoId, [])
      }
      facesByPhotoForPerson.get(photoId)!.push(pf)
    }

    for (const pf of photoFaces) {
      if (!pf.gallery_images) continue

      const photoId = pf.gallery_images.id
      if (!photosMap.has(photoId)) {
        // Check if ANY face for this person on this photo is verified
        const facesForPerson = facesByPhotoForPerson.get(photoId) || []
        const isVerified = facesForPerson.some((face) => face.verified === true)

        logger.debug("admin/actions", `Photo ${pf.gallery_images.original_filename}:`)
        logger.debug("admin/actions", `  - Photo ID: ${photoId}`)
        logger.debug("admin/actions", `  - Faces for this person: ${facesForPerson.length}`)
        facesForPerson.forEach((face, idx) => {
          logger.debug("admin/actions", `  - Face ${idx + 1}: verified=${face.verified}, confidence=${face.confidence}`)
        })
        logger.debug("admin/actions", `  - Final isVerified: ${isVerified}`)

        photosMap.set(photoId, {
          ...pf.gallery_images,
          faceId: pf.id,
          confidence: pf.confidence,
          verified: isVerified, // Use the computed verified status
          boundingBox: pf.insightface_bbox, // Use insightface_bbox instead of bounding_box
          shootDate: pf.gallery_images.galleries?.shoot_date || null,
          filename: pf.gallery_images.original_filename || "",
          gallery_name: pf.gallery_images.galleries?.title || null,
        })
      }
    }

    const photos = Array.from(photosMap.values())
    logger.debug("admin/actions", "Returning", photos.length, "unique photos")
    logger.debug("admin/actions", " ===== getPersonPhotosWithDetailsAction END =====")

    const photoIds = photos.map((p) => p.id)

    const { data: allPhotoFaces, error: facesError } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, verified, confidence, people(real_name, telegram_name)")
      .in("photo_id", photoIds)
      .or(`verified.eq.true,confidence.gte.0.6`)

    if (facesError) {
      logger.error("admin/actions", "Error getting all faces", facesError)
      throw facesError
    }

    const facesByPhoto = new Map<string, any[]>()
    for (const face of allPhotoFaces || []) {
      if (!facesByPhoto.has(face.photo_id)) {
        facesByPhoto.set(face.photo_id, [])
      }
      facesByPhoto.get(face.photo_id)!.push(face)
    }

    const photosWithFaceCount = photos.map((photo) => {
      const faces = facesByPhoto.get(photo.id) || []

      const uniquePersonIds = new Set(faces.map((face) => face.person_id).filter(Boolean))
      const faceCount = uniquePersonIds.size

      logger.debug("admin/actions", `Photo ${photo.id} (${photo.filename}): ${faceCount} unique person(s) found`)
      if (faces.length > 0) {
        logger.debug("admin/actions", `Detailed face info for ${photo.filename}:`)
        faces.forEach((face, index) => {
          const personName = face.people?.real_name || face.people?.telegram_name || "Unknown"
          logger.debug(
            "admin/actions",
            `  Face ${index + 1}: Person="${personName}" (ID: ${face.person_id}), verified=${face.verified}, confidence=${face.confidence}`,
          )
        })
      }

      return {
        ...photo,
        faceCount: faceCount,
      }
    })

    photosWithFaceCount.sort((a, b) => {
      const dateA = a.shootDate ? new Date(a.shootDate).getTime() : 0
      const dateB = b.shootDate ? new Date(b.shootDate).getTime() : 0

      if (dateB !== dateA) {
        return dateB - dateA
      }

      return b.filename.localeCompare(a.filename)
    })

    logger.debug("admin/actions", "Photos with face count and sorted:", photosWithFaceCount.length)
    return { success: true, data: photosWithFaceCount }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting person photos with details", error)
    return { error: error.message || "Failed to get person photos" }
  }
}

export async function deleteFaceDescriptorsForPhotoAction(photoId: string, personId: string) {
  const supabase = await createClient()

  try {
    const { data: verifiedFaces } = await supabase
      .from("photo_faces")
      .select("id")
      .eq("photo_id", photoId)
      .eq("person_id", personId)
      .eq("verified", true)

    const hasVerifiedFaces = verifiedFaces && verifiedFaces.length > 0

    const { error: descError } = await supabase
      .from("face_descriptors")
      .delete()
      .eq("source_image_id", photoId)
      .eq("person_id", personId)

    if (descError) throw descError

    const { error: faceError } = await supabase
      .from("photo_faces")
      .delete()
      .eq("photo_id", photoId)
      .eq("person_id", personId)

    if (faceError) throw faceError

    if (hasVerifiedFaces) {
      logger.info("admin/actions", "Rebuilding recognition index after deleting verified faces", { photoId, personId })
      await rebuildRecognitionIndexAction()
    }

    revalidatePath("/admin")
    logger.info("admin/actions", "Face descriptors and faces deleted successfully", {
      photoId,
      personId,
      hadVerified: hasVerifiedFaces,
    })
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error deleting face descriptors for photo", error)
    return { error: error.message || "Failed to delete face descriptors" }
  }
}

export async function verifyPersonOnPhotoAction(photoId: string, personId: string) {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from("photo_faces")
      .update({
        verified: true,
        confidence: 1.0,
      })
      .eq("photo_id", photoId)
      .eq("person_id", personId) // Added this to update specific person on photo

    if (error) throw error

    revalidatePath("/admin")
    logger.info("admin/actions", "Person verified on photo successfully", { photoId, personId })
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error verifying person on photo", error)
    return { error: error.message || "Failed to verify person" }
  }
}

export async function updatePersonVisibilityAction(
  personId: string,
  field: "show_in_players_gallery" | "show_photos_in_galleries",
  value: boolean,
) {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from("people")
      .update({ [field]: value })
      .eq("id", personId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("admin/actions", "Person visibility updated successfully", { personId, field, value })
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error updating person visibility", error)
    return { error: error.message || "Failed to update person visibility" }
  }
}

export async function debugPersonPhotosAction(personRealName: string) {
  const supabase = await createClient()

  try {
    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id, real_name")
      .eq("real_name", personRealName)
      .single()

    if (personError || !person) {
      return { error: `Person "${personRealName}" not found` }
    }

    logger.debug("admin/actions", `Debug: Found person ${person.real_name} (${person.id})`)

    const { data: faceDescriptors, error: descriptorsError } = await supabase
      .from("face_descriptors")
      .select("id, person_id, source_image_id, created_at")
      .eq("person_id", person.id)
      .order("created_at", { ascending: true })

    if (descriptorsError) throw descriptorsError

    logger.debug(
      "admin/actions",
      `Debug: Found ${faceDescriptors?.length || 0} face_descriptors for ${person.real_name}`,
    )

    const { data: photoFaces, error: facesError } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, confidence, verified, gallery_images(id, original_filename, gallery_id)")
      .eq("person_id", person.id)

    if (facesError) throw facesError

    logger.debug("admin/actions", `Debug: Found ${photoFaces?.length || 0} photo_faces records for ${person.real_name}`)

    const photoIds = [...new Set(photoFaces?.map((pf) => pf.photo_id) || [])]
    logger.debug("admin/actions", `Debug: Unique photos: ${photoIds.length}`)

    const descriptorsByPhoto = new Map<string, any[]>()
    for (const desc of faceDescriptors || []) {
      if (!desc.source_image_id) continue
      if (!descriptorsByPhoto.has(desc.source_image_id)) {
        descriptorsByPhoto.set(desc.source_image_id, [])
      }
      descriptorsByPhoto.get(desc.source_image_id)!.push(desc)
    }

    const photoDetails = []
    for (const photoId of photoIds) {
      const { data: allFacesOnPhoto, error: allFacesError } = await supabase
        .from("photo_faces")
        .select("id, person_id, confidence, verified, people(real_name, telegram_name)")
        .eq("photo_id", photoId)

      if (allFacesError) {
        logger.error("admin/actions", `Error getting faces for photo ${photoId}`, allFacesError)
        continue
      }

      const photoFace = photoFaces?.find((pf) => pf.photo_id === photoId)
      const filename = photoFace?.gallery_images?.original_filename || "Unknown"

      const facesInfo =
        allFacesOnPhoto?.map((face) => ({
          personName: face.people?.real_name || face.people?.telegram_name || "Unknown",
          personId: face.person_id,
          verified: face.verified,
          confidence: face.confidence,
        })) || []

      const descriptorsForPhoto = descriptorsByPhoto.get(photoId) || []

      photoDetails.push({
        photoId,
        filename,
        faces: facesInfo,
        descriptors: descriptorsForPhoto,
      })
    }

    photoDetails.sort((a, b) => a.filename.localeCompare(b.filename))

    logger.debug(`\n[v0] ========== DEBUG: All photos and descriptors for ${person.real_name} ==========`)
    logger.debug(`[v0] Total face_descriptors: ${faceDescriptors?.length || 0}`)
    logger.debug(`[v0] Total photo_faces: ${photoFaces?.length || 0}`)
    logger.debug(`[v0] Unique photos: ${photoIds.length}`)

    photoDetails.forEach((photo, index) => {
      logger.debug(`\n[v0] Photo ${index + 1}: ${photo.filename}`)
      logger.debug(`[v0]   Photo ID: ${photo.photoId}`)
      logger.debug(`[v0]   Total faces on photo: ${photo.faces.length}`)
      logger.debug(`[v0]   Descriptors for this photo: ${photo.descriptors.length}`)

      if (photo.descriptors.length > 0) {
        logger.debug(`[v0]   Descriptor IDs:`)
        photo.descriptors.forEach((desc, descIndex) => {
          logger.debug(`[v0]     ${descIndex + 1}. ID: ${desc.id}, Created: ${desc.created_at}`)
        })
      }

      photo.faces.forEach((face, faceIndex) => {
        logger.debug(`[v0]   Face ${faceIndex + 1}:`)
        logger.debug(`[v0]     Person: ${face.personName} (ID: ${face.personId})`)
        logger.debug(`[v0]     Verified: ${face.verified}`)
        logger.debug(`[v0]     Confidence: ${face.confidence}`)
      })
    })

    const orphanedDescriptors = (faceDescriptors || []).filter((desc) => !photoIds.includes(desc.source_image_id || ""))

    if (orphanedDescriptors.length > 0) {
      logger.warn(`\n[v0] WARNING: Found ${orphanedDescriptors.length} orphaned descriptors (no matching photo_faces):`)
      orphanedDescriptors.forEach((desc, index) => {
        logger.warn(`[v0]   Orphaned descriptor ${index + 1}:`)
        logger.warn(`[v0]     ID: ${desc.id}`)
        logger.warn(`[v0]     Source Image ID: ${desc.source_image_id || "NULL"}`)
        logger.warn(`[v0]     Created: ${desc.created_at}`)
      })
    }

    logger.debug(`[v0] ========== END DEBUG ==========\n`)

    return {
      success: true,
      data: {
        personName: person.real_name,
        totalDescriptors: faceDescriptors?.length || 0,
        totalPhotoFacesRecords: photoFaces?.length || 0,
        uniquePhotos: photoIds.length,
        orphanedDescriptors: orphanedDescriptors.length,
        photos: photoDetails,
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error in debug action", error)
    return { error: error.message || "Failed to debug person photos" }
  }
}

export async function syncVerifiedAndConfidenceAction() {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Starting sync of verified and confidence fields...")

    const { data: verifiedRecords, error: verifiedError } = await supabase
      .from("photo_faces")
      .update({ confidence: 1.0 })
      .eq("verified", true)
      .select("id")

    if (verifiedError) throw verifiedError

    const verifiedCount = verifiedRecords?.length || 0
    logger.debug("admin/actions", `Updated ${verifiedCount} records: set confidence=1 where verified=true`)

    const { data: confidenceRecords, error: confidenceError } = await supabase
      .from("photo_faces")
      .update({ verified: true })
      .eq("confidence", 1.0)
      .select("id")

    if (confidenceError) throw confidenceError

    const confidenceCount = confidenceRecords?.length || 0
    logger.debug("admin/actions", `Updated ${confidenceCount} records: set verified=true where confidence=1`)

    const { count: totalVerified } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    const { count: totalConfidence1 } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("confidence", 1.0)

    logger.debug(
      "admin/actions",
      `Final stats: ${totalVerified} verified records, ${totalConfidence1} confidence=1 records`,
    )

    revalidatePath("/admin")
    logger.info("admin/actions", "Sync verified and confidence completed", {
      verifiedCount,
      confidenceCount,
      totalVerified,
      totalConfidence1,
    })
    return {
      success: true,
      data: {
        updatedVerified: verifiedCount,
        updatedConfidence: confidenceCount,
        totalVerified: totalVerified || 0,
        totalConfidence1: totalConfidence1 || 0,
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error syncing verified and confidence", error)
    return { error: error.message || "Failed to sync verified and confidence" }
  }
}

export async function debugPhotoFacesAction(filename: string) {
  const supabase = await createClient()

  try {
    const { data: photo, error: photoError } = await supabase
      .from("gallery_images")
      .select("id, original_filename, gallery_id")
      .eq("original_filename", filename)
      .single()

    if (photoError || !photo) {
      return { error: `Photo "${filename}" not found` }
    }

    logger.debug("admin/actions", `Debug: Found photo ${photo.original_filename} (${photo.id})`)

    const { data: photoFaces, error: facesError } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, confidence, verified, insightface_bbox, people(real_name, telegram_name)")
      .eq("photo_id", photo.id)

    if (facesError) throw facesError

    logger.debug("admin/actions", `Debug: Found ${photoFaces?.length || 0} faces on photo ${photo.original_filename}`)

    logger.debug(`\n[v0] ========== DEBUG: Faces on photo "${photo.original_filename}" ==========`)
    logger.debug(`[v0] Photo ID: ${photo.id}`)
    logger.debug(`[v0] Gallery ID: ${photo.gallery_id}`)
    logger.debug(`[v0] Total faces detected: ${photoFaces?.length || 0}`)

    photoFaces?.forEach((face, index) => {
      const personName = face.people?.real_name || face.people?.telegram_name || "Unknown"
      logger.debug("\n[v0] Face", index + 1, ":")
      logger.debug(`[v0]   Person: ${personName}`)
      logger.debug(`[v0]   Person ID: ${face.person_id}`)
      logger.debug(`[v0]   Verified: ${face.verified}`)
      logger.debug(`[v0]   Confidence: ${face.confidence}`)
      logger.debug(`[v0]   Bounding Box:`, face.insightface_bbox) // Use insightface_bbox
    })
    logger.debug(`[v0] ========== END DEBUG ==========\n`)

    return {
      success: true,
      data: {
        photoId: photo.id,
        filename: photo.original_filename,
        galleryId: photo.gallery_id,
        totalFaces: photoFaces?.length || 0,
        faces:
          photoFaces?.map((face) => ({
            personName: face.people?.real_name || face.people?.telegram_name || "Unknown",
            personId: face.person_id,
            verified: face.verified,
            confidence: face.confidence,
            boundingBox: face.insightface_bbox, // Use insightface_bbox
          })) || [],
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error in debug photo action", error)
    return { error: error.message || "Failed to debug photo faces" }
  }
}

export async function cleanupUnverifiedFacesAction() {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Starting cleanup of unverified face descriptors...")

    const { count: totalBefore } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })

    const { count: verifiedBefore } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    logger.debug("admin/actions", `Before cleanup: ${totalBefore} total records, ${verifiedBefore} verified`)

    const { data: inconsistentRecords, error: inconsistentError } = await supabase
      .from("photo_faces")
      .select(
        "id, photo_id, person_id, verified, confidence, people(real_name, telegram_name), gallery_images(original_filename)",
      )
      .eq("verified", true)
      .neq("confidence", 1.0)

    if (inconsistentError) throw inconsistentError

    if (inconsistentRecords && inconsistentRecords.length > 0) {
      logger.warn(
        "admin/actions",
        `Found ${inconsistentRecords.length} records with verified=true but confidence != 1:`,
      )
      inconsistentRecords.forEach((record) => {
        const personName = record.people?.real_name || record.people?.telegram_name || "Unknown"
        const filename = record.gallery_images?.original_filename || "Unknown"
        logger.warn("admin/actions", `  - Photo: ${filename}, Person: ${personName}, Confidence: ${record.confidence}`)
      })
    }

    const { data: unverifiedFaces, error: fetchError } = await supabase
      .from("photo_faces")
      .select("photo_id, person_id")
      .eq("verified", false)

    if (fetchError) throw fetchError

    logger.debug("admin/actions", `Found ${unverifiedFaces?.length || 0} unverified photo_faces to delete`)

    if (unverifiedFaces && unverifiedFaces.length > 0) {
      // Group by photo_id and person_id to delete matching descriptors
      const descriptorsToDelete = unverifiedFaces.map((face) => ({
        source_image_id: face.photo_id,
        person_id: face.person_id,
      }))

      let deletedDescriptorsCount = 0
      // Delete descriptors in batches to avoid query size limits
      for (const { source_image_id, person_id } of descriptorsToDelete) {
        if (!person_id) continue // Skip if no person_id

        const { data: deletedDescs, error: descError } = await supabase
          .from("face_descriptors")
          .delete()
          .eq("source_image_id", source_image_id)
          .eq("person_id", person_id)
          .select("id")

        if (descError) {
          logger.error("admin/actions", `Error deleting descriptors for image ${source_image_id}`, descError)
        } else {
          deletedDescriptorsCount += deletedDescs?.length || 0
        }
      }

      logger.debug("admin/actions", `Deleted ${deletedDescriptorsCount} corresponding face_descriptors`)
    }

    const { data: deletedRecords, error: deleteError } = await supabase
      .from("photo_faces")
      .delete()
      .eq("verified", false)
      .select("id")

    if (deleteError) throw deleteError

    const deletedCount = deletedRecords?.length || 0
    logger.debug("admin/actions", `Deleted ${deletedCount} unverified photo_faces records`)

    const { count: totalAfter } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })

    const { count: verifiedAfter } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    logger.debug("admin/actions", `After cleanup: ${totalAfter} total records, ${verifiedAfter} verified`)
    logger.info("admin/actions", `Cleanup complete! Deleted ${deletedCount} unverified records.`)

    revalidatePath("/admin")
    return {
      success: true,
      data: {
        before: {
          total: totalBefore || 0,
          verified: verifiedBefore || 0,
        },
        after: {
          total: totalAfter || 0,
          verified: verifiedAfter || 0,
        },
        deleted: deletedCount,
        inconsistentRecords:
          inconsistentRecords?.map((record) => ({
            photoFilename: record.gallery_images?.original_filename || "Unknown",
            personName: record.people?.real_name || record.people?.telegram_name || "Unknown",
            confidence: record.confidence,
          })) || [],
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error cleaning up unverified faces", error)
    return { error: error.message || "Failed to cleanup unverified faces" }
  }
}

export async function cleanupDuplicateFacesAction() {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Starting cleanup of duplicate face descriptors...")

    const { count: totalBefore } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })

    logger.debug("admin/actions", `Before cleanup: ${totalBefore} total photo_faces records`)

    let allRecords: any[] = []
    let hasMore = true
    let offset = 0
    const pageSize = 1000

    while (hasMore) {
      const { data: batch, error: batchError } = await supabase
        .from("photo_faces")
        .select("id, photo_id, person_id, verified, confidence, created_at")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (batchError) throw batchError

      if (batch && batch.length > 0) {
        allRecords = allRecords.concat(batch)
        offset += pageSize
        hasMore = batch.length === pageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allRecords.length} records for analysis`)

    const groupedRecords = new Map<string, any[]>()
    for (const record of allRecords) {
      const key = `${record.person_id}_${record.photo_id}`
      if (!groupedRecords.has(key)) {
        groupedRecords.set(key, [])
      }
      groupedRecords.get(key)!.push(record)
    }

    const duplicateGroups = Array.from(groupedRecords.entries()).filter(([_, records]) => records.length > 1)

    logger.debug("admin/actions", `Found ${duplicateGroups.length} groups with duplicates`)

    let totalDeleted = 0
    const idsToDelete: string[] = []

    for (const [key, records] of duplicateGroups) {
      records.sort((a, b) => {
        if (a.verified !== b.verified) return b.verified ? 1 : -1
        if (a.confidence !== b.confidence) return (b.confidence || 0) - (a.confidence || 0)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      const toKeep = records[0]
      const toDelete = records.slice(1)

      logger.debug(
        "admin/actions",
        `Group ${key}: keeping record ${toKeep.id} (verified=${toKeep.verified}, confidence=${toKeep.confidence}, created_at=${toKeep.created_at}), deleting ${toDelete.length} duplicates`,
      )

      idsToDelete.push(...toDelete.map((r) => r.id))
      totalDeleted += toDelete.length
    }

    const batchSize = 100

    if (idsToDelete.length > 0) {
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize)
        const { error: deleteError } = await supabase.from("photo_faces").delete().in("id", batch)

        if (deleteError) {
          logger.error("admin/actions", `Error deleting descriptor batch ${i / batchSize + 1}`, deleteError)
          throw deleteError
        }
      }
    }

    logger.debug("admin/actions", `Deleted ${totalDeleted} duplicate photo_faces records`)

    logger.debug("admin/actions", "Cleaning up orphaned face_descriptors...")

    const validCombinations = new Set(
      allRecords.filter((r) => !idsToDelete.includes(r.id)).map((r) => `${r.person_id}_${r.photo_id}`),
    )

    let allDescriptors: any[] = []
    let descOffset = 0
    let descHasMore = true
    const descriptorPageSize = 1000

    while (descHasMore) {
      const { data: descBatch, error: descError } = await supabase
        .from("face_descriptors")
        .select("id, person_id, source_image_id")
        .range(descOffset, descOffset + descriptorPageSize - 1)

      if (descError) throw descError

      if (descBatch && descBatch.length > 0) {
        allDescriptors = allDescriptors.concat(descBatch)
        descOffset += descriptorPageSize
        descHasMore = descBatch.length === descriptorPageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allDescriptors.length} face_descriptors for analysis`)

    const orphanedDescriptorIds = allDescriptors
      .filter((desc) => {
        const key = `${desc.person_id}_${desc.source_image_id}`
        return !validCombinations.has(key)
      })
      .map((desc) => desc.id)

    logger.debug("admin/actions", `Found ${orphanedDescriptorIds.length} orphaned face_descriptors`)

    let deletedDescriptors = 0
    if (orphanedDescriptorIds.length > 0) {
      const descriptorBatchSize = 100
      for (let i = 0; i < orphanedDescriptorIds.length; i += descriptorBatchSize) {
        const batch = orphanedDescriptorIds.slice(i, i + descriptorBatchSize)
        const { error: deleteDescError } = await supabase.from("face_descriptors").delete().in("id", batch)

        if (deleteDescError) {
          logger.error("admin/actions", `Error deleting descriptor batch ${i / batchSize + 1}`, deleteDescError)
          throw deleteDescError
        }
        deletedDescriptors += batch.length
      }
    }

    logger.debug("admin/actions", `Deleted ${deletedDescriptors} orphaned face_descriptors`)

    const { count: totalAfter } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })

    const { count: verifiedAfter } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    const { count: descriptorsAfter } = await supabase
      .from("face_descriptors")
      .select("*", { count: "exact", head: true })

    logger.info(
      "admin/actions",
      `After cleanup: ${totalAfter} photo_faces records, ${verifiedAfter} verified, ${descriptorsAfter} face_descriptors`,
    )
    logger.info(
      "admin/actions",
      `Cleanup complete! Deleted ${totalDeleted} duplicates and ${deletedDescriptors} orphaned descriptors.`,
    )

    revalidatePath("/admin")
    return {
      success: true,
      data: {
        before: {
          total: totalBefore || 0,
        },
        after: {
          total: totalAfter || 0,
          verified: verifiedAfter || 0,
          descriptors: descriptorsAfter || 0,
        },
        deleted: totalDeleted,
        deletedDescriptors: deletedDescriptors,
        duplicateGroups: duplicateGroups.length,
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error cleaning up duplicate faces", error)
    return { error: error.message || "Failed to cleanup duplicate faces" }
  }
}

export async function cleanupPersonDescriptorsAction(personRealName: string) {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", `Starting cleanup for person: ${personRealName}`)

    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id, real_name")
      .eq("real_name", personRealName)
      .single()

    if (personError || !person) {
      logger.error("admin/actions", `Person not found: ${personRealName}`)
      return { error: `Person not found: ${personRealName}` }
    }

    logger.debug("admin/actions", "Found person:", person.real_name, person.id)

    const { count: descriptorsBefore } = await supabase
      .from("face_descriptors")
      .select("id", { count: "exact", head: true })
      .eq("person_id", person.id)

    logger.debug("admin/actions", `Before cleanup: ${descriptorsBefore} descriptors`)

    const { data: photoFaces, error: pfError } = await supabase
      .from("photo_faces")
      .select("photo_id, person_id, verified")
      .eq("person_id", person.id)

    if (pfError) throw pfError

    logger.debug("admin/actions", `Loaded ${photoFaces?.length || 0} photo_faces records`)

    const verifiedMap = new Map<string, boolean>()
    for (const pf of photoFaces || []) {
      const key = `${pf.person_id}_${pf.photo_id}`
      verifiedMap.set(key, pf.verified)
    }

    const { data: descriptors, error: descError } = await supabase
      .from("face_descriptors")
      .select("id, person_id, source_image_id, created_at")
      .eq("person_id", person.id)
      .order("created_at", { ascending: true })

    if (descError) throw descError

    logger.debug("admin/actions", `Loaded ${descriptors?.length || 0} descriptors`)

    const groupedDescriptors = new Map<string, any[]>()
    for (const descriptor of descriptors || []) {
      if (!descriptor.source_image_id) continue

      const photoId = descriptor.source_image_id
      if (!groupedDescriptors.has(photoId)) {
        groupedDescriptors.set(photoId, [])
      }
      groupedDescriptors.get(photoId)!.push(descriptor)
    }

    const duplicateGroups = Array.from(groupedDescriptors.entries()).filter(([_, descs]) => descs.length > 1)

    logger.debug("admin/actions", `Found ${duplicateGroups.length} photos with duplicates`)

    let totalDeleted = 0
    let verifiedGroupsCount = 0
    let unverifiedGroupsCount = 0
    const idsToDelete: string[] = []

    for (const [photoId, descs] of duplicateGroups) {
      const key = `${person.id}_${photoId}`
      const isVerified = verifiedMap.get(key) || false

      if (isVerified) {
        // Keep OLDEST for verified
        descs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        verifiedGroupsCount++
      } else {
        // Keep NEWEST for unverified
        descs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        unverifiedGroupsCount++
      }

      const toDelete = descs.slice(1)
      idsToDelete.push(...toDelete.map((d) => d.id))
      totalDeleted += toDelete.length
    }

    logger.debug(
      "admin/actions",
      `Verified groups: ${verifiedGroupsCount}, Unverified groups: ${unverifiedGroupsCount}`,
    )

    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabase.from("face_descriptors").delete().in("id", idsToDelete)

      if (deleteError) throw deleteError
    }

    logger.debug("admin/actions", `Deleted ${totalDeleted} duplicates`)

    const { count: descriptorsAfter } = await supabase
      .from("face_descriptors")
      .select("id", { count: "exact", head: true })
      .eq("person_id", person.id)

    const { count: photoFacesCount } = await supabase
      .from("photo_faces")
      .select("id", { count: "exact", head: true })
      .eq("person_id", person.id)

    logger.debug("admin/actions", `After cleanup: ${descriptorsAfter} descriptors, ${photoFacesCount} photo_faces`)
    logger.info(
      "admin/actions",
      `Cleanup for person ${person.real_name} completed. Deleted ${totalDeleted} descriptors.`,
    )

    revalidatePath("/admin")
    return {
      success: true,
      data: {
        personName: person.real_name,
        before: {
          descriptors: descriptorsBefore || 0,
        },
        after: {
          descriptors: descriptorsAfter || 0,
          photoFaces: photoFacesCount || 0,
        },
        deletedDescriptors: totalDeleted,
        duplicateGroups: duplicateGroups.length,
        verifiedGroups: verifiedGroupsCount,
        unverifiedGroups: unverifiedGroupsCount,
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error cleaning up person descriptors", error)
    return { error: error.message || "Failed to cleanup person descriptors" }
  }
}

export async function regeneratePersonDescriptorsAction(personId: string) {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", `Starting descriptor regeneration for person ID: ${personId}`)

    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id, real_name")
      .eq("id", personId)
      .single()

    if (personError || !person) {
      logger.error("admin/actions", `Person not found with ID: ${personId}`)
      return { error: `Person not found with ID: ${personId}` }
    }

    logger.debug("admin/actions", "Found person:", person.real_name, person.id)

    const { error: deleteDescError } = await supabase.from("face_descriptors").delete().eq("person_id", person.id)

    if (deleteDescError) throw deleteDescError

    logger.debug("admin/actions", `Deleted all existing descriptors for ${person.real_name}`)

    const { data: verifiedFaces, error: facesError } = await supabase
      .from("photo_faces")
      .select("id, photo_id, insightface_bbox, gallery_images(id, image_url, original_filename)")
      .eq("person_id", person.id)
      .eq("verified", true)

    if (facesError) throw facesError

    logger.debug("admin/actions", `Found ${verifiedFaces?.length || 0} verified faces for regeneration`)

    // The client will need to:
    // 1. Load each image
    // 2. Extract face region using bounding_box
    // 3. Generate descriptor using face-api.js
    // 4. Save descriptor back to database

    return {
      success: true,
      data: {
        personId: person.id,
        personName: person.real_name,
        facesToProcess:
          verifiedFaces?.map((face: any) => ({
            faceId: face.id,
            photoId: face.photo_id,
            boundingBox: face.insightface_bbox, // Use insightface_bbox
            imageUrl: face.gallery_images?.image_url,
            filename: face.gallery_images?.original_filename,
          })) || [],
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error regenerating person descriptors", error)
    return { error: error.message || "Failed to regenerate person descriptors" }
  }
}

export async function cleanupDuplicateDescriptorsAction() {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Starting cleanup of duplicate face descriptors...")

    const { count: descriptorsBefore } = await supabase
      .from("face_descriptors")
      .select("*", { count: "exact", head: true })

    logger.debug("admin/actions", `Before cleanup: ${descriptorsBefore} total face_descriptors`)

    let allPhotoFaces: any[] = []
    let pfHasMore = true
    let pfOffset = 0
    const pfPageSize = 1000

    while (pfHasMore) {
      const { data: pfBatch, error: pfError } = await supabase
        .from("photo_faces")
        .select(
          `
          photo_id,
          person_id,
          verified
        `,
        )
        .range(pfOffset, pfOffset + pfPageSize - 1)

      if (pfError) throw pfError

      if (pfBatch && pfBatch.length > 0) {
        allPhotoFaces = allPhotoFaces.concat(pfBatch)
        pfOffset += pfPageSize
        pfHasMore = pfBatch.length === pfPageSize
      } else {
        pfHasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allPhotoFaces.length} photo_faces records`)

    const verifiedMap = new Map<string, boolean>()
    for (const pf of allPhotoFaces) {
      const key = `${pf.person_id}_${pf.photo_id}`
      verifiedMap.set(key, pf.verified)
    }

    let allDescriptors: any[] = []
    let hasMore = true
    let offset = 0
    const pageSize = 1000

    while (hasMore) {
      const { data: batch, error: batchError } = await supabase
        .from("face_descriptors")
        .select("id, person_id, source_image_id, created_at")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (batchError) throw batchError

      if (batch && batch.length > 0) {
        allDescriptors = allDescriptors.concat(batch)
        offset += pageSize
        hasMore = batch.length === pageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allDescriptors.length} face_descriptors for analysis`)

    const groupedDescriptors = new Map<string, any[]>()
    for (const descriptor of allDescriptors) {
      if (!descriptor.source_image_id) continue

      const key = `${descriptor.person_id}_${descriptor.source_image_id}`
      if (!groupedDescriptors.has(key)) {
        groupedDescriptors.set(key, [])
      }
      groupedDescriptors.get(key)!.push(descriptor)
    }

    const duplicateGroups = Array.from(groupedDescriptors.entries()).filter(
      ([_, descriptors]) => descriptors.length > 1,
    )

    logger.debug("admin/actions", `Found ${duplicateGroups.length} groups with duplicate descriptors`)

    let totalDeleted = 0
    let verifiedGroupsCount = 0
    let unverifiedGroupsCount = 0
    const idsToDelete: string[] = []

    for (const [key, descriptors] of duplicateGroups) {
      const isVerified = verifiedMap.get(key) || false

      if (isVerified) {
        // Keep OLDEST for verified
        descriptors.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        verifiedGroupsCount++
        logger.debug(
          "admin/actions",
          `Group ${key} (VERIFIED): keeping OLDEST descriptor ${descriptors[0].id} (created ${descriptors[0].created_at})`,
        )
      } else {
        // Keep NEWEST for unverified
        descriptors.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        unverifiedGroupsCount++
        logger.debug(
          "admin/actions",
          `Group ${key} (unverified): keeping NEWEST descriptor ${descriptors[0].id} (created ${descriptors[0].created_at})`,
        )
      }

      const toDelete = descriptors.slice(1)
      idsToDelete.push(...toDelete.map((d) => d.id))
      totalDeleted += toDelete.length
    }

    logger.debug(
      "admin/actions",
      `Processed ${verifiedGroupsCount} verified groups and ${unverifiedGroupsCount} unverified groups`,
    )

    if (idsToDelete.length > 0) {
      const batchSize = 100
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize)
        const { error: deleteError } = await supabase.from("face_descriptors").delete().in("id", batch)

        if (deleteError) {
          logger.error("admin/actions", `Error deleting batch ${i / batchSize + 1}`, deleteError)
          throw deleteError
        }
      }
    }

    logger.debug("admin/actions", `Deleted ${totalDeleted} duplicate face_descriptors`)

    const { count: descriptorsAfter } = await supabase
      .from("face_descriptors")
      .select("*", { count: "exact", head: true })

    const { count: photoFacesCount } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })

    logger.debug(
      "admin/actions",
      `After cleanup: ${descriptorsAfter} face_descriptors, ${photoFacesCount} photo_faces records`,
    )
    logger.info("admin/actions", `Cleanup complete! Deleted ${totalDeleted} duplicate descriptors.`)

    revalidatePath("/admin")
    return {
      success: true,
      data: {
        before: {
          descriptors: descriptorsBefore || 0,
        },
        after: {
          descriptors: descriptorsAfter || 0,
          photoFaces: photoFacesCount || 0,
        },
        deletedDescriptors: totalDeleted,
        duplicateGroups: duplicateGroups.length,
        verifiedGroups: verifiedGroupsCount,
        unverifiedGroups: unverifiedGroupsCount,
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error cleaning up duplicate descriptors", error)
    return { error: error.message || "Failed to cleanup duplicate descriptors" }
  }
}

export async function getPhotosWithExcessDescriptorsAction() {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Finding photos with excess descriptors...")

    // Get all photo_faces with person info
    let allPhotoFaces: any[] = []
    let hasMore = true
    let offset = 0
    const pageSize = 1000

    while (hasMore) {
      const { data: batch, error: batchError } = await supabase
        .from("photo_faces")
        .select(
          `
          photo_id,
          person_id,
          verified,
          insightface_bbox,
          gallery_images!photo_faces_photo_id_fkey(id, image_url, original_filename)
        `,
        )
        .eq("verified", true)
        .range(offset, offset + pageSize - 1)

      if (batchError) throw batchError

      if (batch && batch.length > 0) {
        allPhotoFaces = allPhotoFaces.concat(batch)
        offset += pageSize
        hasMore = batch.length === pageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allPhotoFaces.length} verified photo_faces`)

    // Group by photo_id to count faces per photo
    const facesByPhoto = new Map<string, any[]>()
    for (const face of allPhotoFaces) {
      if (!facesByPhoto.has(face.photo_id)) {
        facesByPhoto.set(face.photo_id, [])
      }
      facesByPhoto.get(face.photo_id)!.push(face)
    }

    // Get all descriptors
    let allDescriptors: any[] = []
    let descHasMore = true
    let descOffset = 0

    while (descHasMore) {
      const { data: descBatch, error: descError } = await supabase
        .from("face_descriptors")
        .select("id, person_id, source_image_id")
        .range(descOffset, descOffset + pageSize - 1)

      if (descError) throw descError

      if (descBatch && descBatch.length > 0) {
        allDescriptors = allDescriptors.concat(descBatch)
        descOffset += pageSize
        descHasMore = descBatch.length === pageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allDescriptors.length} descriptors`)

    // Group descriptors by photo_id and person_id
    const descriptorsByPhotoAndPerson = new Map<string, number>()
    for (const desc of allDescriptors) {
      if (!desc.source_image_id) continue
      const key = `${desc.source_image_id}_${desc.person_id}`
      descriptorsByPhotoAndPerson.set(key, (descriptorsByPhotoAndPerson.get(key) || 0) + 1)
    }

    // Find photos where descriptor count > face count
    const photosToProcess: any[] = []
    const peopleStats = new Map<string, { personId: string; photoCount: number }>()

    for (const [photoId, faces] of facesByPhoto.entries()) {
      const uniquePersonIds = new Set(faces.map((f) => f.person_id))
      const faceCount = uniquePersonIds.size

      // Count total descriptors for this photo
      let descriptorCount = 0
      for (const personId of uniquePersonIds) {
        const key = `${photoId}_${personId}`
        descriptorCount += descriptorsByPhotoAndPerson.get(key) || 0
      }

      if (descriptorCount > faceCount) {
        logger.debug("admin/actions", `Photo ${photoId}: ${descriptorCount} descriptors > ${faceCount} faces`)

        // Add to processing list
        for (const face of faces) {
          photosToProcess.push({
            photoId: face.photo_id,
            personId: face.person_id,
            boundingBox: face.insightface_bbox, // Use insightface_bbox
            imageUrl: face.gallery_images?.image_url,
            filename: face.gallery_images?.original_filename,
          })

          // Update people stats
          if (!peopleStats.has(face.person_id)) {
            peopleStats.set(face.person_id, { personId: face.person_id, photoCount: 0 })
          }
          const stats = peopleStats.get(face.person_id)!
          stats.photoCount++
        }
      }
    }

    // Get person names for stats
    const personIds = Array.from(peopleStats.keys())
    const { data: people, error: peopleError } = await supabase
      .from("people")
      .select("id, real_name, telegram_name")
      .in("id", personIds)

    if (peopleError) throw peopleError

    const peopleMap = new Map(people?.map((p) => [p.id, p.real_name || p.telegram_name]) || [])

    const statsArray = Array.from(peopleStats.values()).map((stat) => ({
      personId: stat.personId,
      personName: peopleMap.get(stat.personId) || "Unknown",
      photoCount: stat.photoCount,
    }))

    logger.info("admin/actions", `Found ${photosToProcess.length} faces to process across ${statsArray.length} people`)

    return {
      success: true,
      data: {
        facesToProcess: photosToProcess,
        peopleStats: statsArray,
        totalFaces: photosToProcess.length,
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting photos with excess descriptors", error)
    return { error: error.message || "Failed to get photos with excess descriptors" }
  }
}

export async function getVerifiedPeopleForPhotoAction(photoId: string) {
  const supabase = await createClient()

  try {
    const { data: faces, error } = await supabase
      .from("photo_faces")
      .select("person_id, people(id, real_name, telegram_name)")
      .eq("photo_id", photoId)
      .eq("verified", true)

    if (error) {
      logger.error("admin/actions", "Error fetching verified people for photo", error)
      return { success: false, error: error.message }
    }

    const people = (faces || [])
      .filter((face) => face.people)
      .map((face) => ({
        id: face.people!.id,
        name: face.people!.real_name || face.people!.telegram_name || "Неизвестный",
      }))

    logger.debug("admin/actions", `Found ${people.length} verified people for photo ${photoId}`)
    return { success: true, data: people }
  } catch (error: any) {
    logger.error("admin/actions", "Error getting verified people for photo", error)
    return { success: false, error: error.message || "Failed to get verified people" }
  }
}

export async function prepareTrainingDatasetAction() {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Starting dataset preparation...")

    // Get all photo_faces with person info
    let allPhotoFaces: any[] = []
    let hasMore = true
    let offset = 0
    const pageSize = 1000

    while (hasMore) {
      const { data: batch, error: batchError } = await supabase
        .from("photo_faces")
        .select(
          `
          photo_id,
          person_id,
          verified,
          insightface_bbox,
          gallery_images(id, image_url, original_filename)
        `,
        )
        .eq("verified", true)
        .range(offset, offset + pageSize - 1)

      if (batchError) throw batchError

      if (batch && batch.length > 0) {
        allPhotoFaces = allPhotoFaces.concat(batch)
        offset += pageSize
        hasMore = batch.length === pageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allPhotoFaces.length} verified photo_faces`)

    // Group by photo_id to count faces per photo
    const facesByPhoto = new Map<string, any[]>()
    for (const face of allPhotoFaces) {
      if (!facesByPhoto.has(face.photo_id)) {
        facesByPhoto.set(face.photo_id, [])
      }
      facesByPhoto.get(face.photo_id)!.push(face)
    }

    // Get all descriptors
    let allDescriptors: any[] = []
    let descHasMore = true
    let descOffset = 0

    while (descHasMore) {
      const { data: descBatch, error: descError } = await supabase
        .from("face_descriptors")
        .select("id, person_id, source_image_id")
        .range(descOffset, descOffset + pageSize - 1)

      if (descError) throw descError

      if (descBatch && descBatch.length > 0) {
        allDescriptors = allDescriptors.concat(descBatch)
        descOffset += pageSize
        descHasMore = descBatch.length === pageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("admin/actions", `Loaded ${allDescriptors.length} descriptors`)

    // Group descriptors by photo_id and person_id
    const descriptorsByPhotoAndPerson = new Map<string, number>()
    for (const desc of allDescriptors) {
      if (!desc.source_image_id) continue
      const key = `${desc.source_image_id}_${desc.person_id}`
      descriptorsByPhotoAndPerson.set(key, (descriptorsByPhotoAndPerson.get(key) || 0) + 1)
    }

    // Prepare training data
    const trainingData: Array<{ imageUrl: string; label: string }> = []
    const personImageCount = new Map<string, number>()

    for (const [photoId, faces] of facesByPhoto.entries()) {
      for (const face of faces) {
        const personId = face.person_id
        const imageUrl = face.gallery_images?.image_url
        const filename = face.gallery_images?.original_filename

        if (!personId || !imageUrl || !filename) continue

        // Ensure we don't exceed a reasonable number of images per person for training
        const currentCount = personImageCount.get(personId) || 0
        if (currentCount >= 100) continue // Limit to 100 images per person

        // Check if there are corresponding descriptors
        const descriptorCount = descriptorsByPhotoAndPerson.get(`${photoId}_${personId}`) || 0
        if (descriptorCount === 0) continue

        trainingData.push({
          imageUrl: imageUrl,
          label: personId, // Use person_id as the label
        })

        personImageCount.set(personId, currentCount + 1)

        logger.debug(
          "admin/actions",
          `Added to training data: PhotoID=${photoId}, PersonID=${personId}, Filename=${filename}, ImageURL=${imageUrl}`,
        )
      }
    }

    logger.info("admin/actions", `Prepared ${trainingData.length} entries for training dataset.`)

    // Optional: Save training data to a file or return it
    // For now, just log and return success. In a real app, you might want to save this.
    // Example: await supabase.storage.from('datasets').upload(`training_data_${Date.now()}.json`, JSON.stringify(trainingData));

    return {
      success: true,
      data: {
        datasetSize: trainingData.length,
        trainingData: trainingData, // Returning data for potential further processing or download
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error preparing training dataset", error)
    return { error: error.message || "Failed to prepare training dataset" }
  }
}

export async function savePhotoFaceTagsAction(
  photoId: string,
  tags: {
    personId: string
    boundingBox: { x: number; y: number; width: number; height: number }
    embedding?: number[]
    confidence: number | null
    verified: boolean
  }[],
) {
  const supabase = await createClient()

  logger.debug("admin/actions", `savePhotoFaceTagsAction called for photo: ${photoId} with ${tags.length} tags`)

  try {
    const { data: photo, error: photoError } = await supabase
      .from("gallery_images")
      .select("image_url")
      .eq("id", photoId)
      .single()

    if (photoError || !photo) {
      logger.error("admin/actions", "Error fetching photo", photoError)
      return { error: "Photo not found" }
    }

    logger.debug("admin/actions", "Photo found:", photo.image_url)

    // Delete existing tags and descriptors for this photo
    await supabase.from("photo_faces").delete().eq("photo_id", photoId)
    await supabase.from("face_descriptors").delete().eq("source_image_id", photoId)

    if (tags.length > 0) {
      logger.debug("admin/actions", "Calling backend to generate descriptors")

      try {
        const result = await apiFetch("/api/recognition/generate-descriptors", {
          method: "POST",
          body: JSON.JSON.stringify({
            image_url: photo.image_url,
            faces: tags.map((tag) => ({
              person_id: tag.personId,
              bbox: tag.boundingBox,
              verified: tag.verified,
              photo_id: photoId,
            })),
          }),
        })

        logger.debug("admin/actions", "Descriptors generated:", result)
      } catch (fetchError) {
        logger.error("admin/actions", "Error calling backend for descriptors", fetchError)
        // Continue anyway - save the tags even if descriptor generation fails
      }
    }

    const tagsToInsert = tags.map((tag) => ({
      photo_id: photoId,
      person_id: tag.personId,
      insightface_bbox: tag.boundingBox, // Use insightface_bbox
      confidence: tag.confidence,
      verified: tag.verified,
    }))

    logger.debug("admin/actions", "Inserting tags:", tagsToInsert)

    const { error } = await supabase.from("photo_faces").insert(tagsToInsert)

    if (error) {
      logger.error("admin/actions", "Error saving photo face tags", error)
      return { error: error.message }
    }

    logger.info("admin/actions", "Tags saved successfully")

    revalidatePath("/admin")
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error in savePhotoFaceTagsAction", error)
    return { error: error.message || "Failed to save tags" }
  }
}

// NEW FUNCTION: getUnknownFaceClustersAction
export async function getUnknownFaceClustersAction(galleryId: string) {
  try {
    logger.debug("admin/actions", `Clustering unknown faces for gallery ${galleryId}`)
    const data = await apiFetch(`/api/cluster-unknown-faces?gallery_id=${galleryId}`, {
      method: "POST",
    })

    logger.debug("admin/actions", `Found ${data.clusters?.length || 0} unknown face clusters`)
    return { success: true, data: data.clusters }
  } catch (error: any) {
    logger.error("admin/actions", "Error clustering unknown faces", error)
    return { error: error.message || "Failed to cluster unknown faces" }
  }
}

// NEW FUNCTION: regenerateUnknownDescriptorsAction
export async function regenerateUnknownDescriptorsAction(galleryId: string) {
  try {
    logger.debug("admin/actions", `Calling regenerate-unknown-descriptors for gallery ${galleryId}`)

    const data = await apiFetch(`/api/recognition/regenerate-unknown-descriptors?gallery_id=${galleryId}`, {
      method: "POST",
    })

    logger.info("admin/actions", `Regenerated descriptors for gallery ${galleryId}`, data)
    return {
      success: true,
      data: {
        totalFaces: data.total_faces,
        regenerated: data.regenerated,
        failed: data.failed,
        alreadyHadDescriptor: data.already_had_descriptor,
      },
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error regenerating descriptors", error)
    return { error: error.message || "Failed to regenerate descriptors" }
  }
}

export async function rejectFaceClusterAction(clusterFaces: { photo_id: string; descriptor: number[] }[]) {
  try {
    logger.debug("admin/actions", `Rejecting ${clusterFaces.length} faces from a cluster`)
    await apiFetch("/api/recognition/reject-faces", {
      method: "POST",
      body: JSON.JSON.stringify({ faces: clusterFaces }),
    })

    logger.info("admin/actions", `Successfully rejected ${clusterFaces.length} faces`)
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error rejecting faces", error)
    return { error: error.message || "Failed to reject faces" }
  }
}

export async function createPersonFromClusterAction(
  personName: string,
  clusterFaces: { photo_id: string; descriptor: number[] }[],
) {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", `Creating person from cluster: ${personName}`)
    const { data: person, error: personError } = await supabase
      .from("people")
      .insert({
        real_name: personName,
        show_in_players_gallery: true,
        show_photos_in_galleries: true,
      })
      .select()
      .single()

    if (personError) throw personError

    const descriptors = clusterFaces.map((face) => ({
      person_id: person.id,
      descriptor: face.descriptor,
      source_image_id: face.photo_id,
    }))

    const { error: descriptorsError } = await supabase.from("face_descriptors").insert(descriptors)

    if (descriptorsError) throw descriptorsError

    for (const face of clusterFaces) {
      const { error: updateError } = await supabase
        .from("photo_faces")
        .update({
          person_id: person.id,
          verified: false,
        })
        .eq("photo_id", face.photo_id)
        .is("person_id", null)

      if (updateError) {
        logger.error("admin/actions", "Error updating photo_face", updateError)
      }
    }

    logger.info("admin/actions", `Person created from cluster: ${personName}`, {
      personId: person.id,
      clusterSize: clusterFaces.length,
    })
    return { success: true, data: person }
  } catch (error: any) {
    logger.error("admin/actions", "Error creating person from cluster", error)
    return { error: error.message || "Failed to create person from cluster" }
  }
}

export async function generateMissingDescriptorsAction() {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Generating missing descriptors...")
    const { data: facesWithoutDescriptors, error: queryError } = await supabase.rpc(
      "get_verified_faces_without_descriptors",
    )

    if (queryError) {
      logger.error("admin/actions", "Error fetching faces without descriptors", queryError)
      return { error: queryError.message }
    }

    if (!facesWithoutDescriptors || facesWithoutDescriptors.length === 0) {
      logger.info("admin/actions", "No faces without descriptors found")
      return { success: true, processed: 0, message: "No faces without descriptors found" }
    }

    const photoMap = new Map<
      string,
      Array<{
        person_id: string
        bbox: { x: number; y: number; width: number; height: number }
        verified: boolean
      }>
    >()

    const photoUrls = new Map<string, string>()

    for (const face of facesWithoutDescriptors) {
      if (!photoMap.has(face.photo_id)) {
        photoMap.set(face.photo_id, [])
        photoUrls.set(face.photo_id, face.image_url)
      }

      photoMap.get(face.photo_id)!.push({
        person_id: face.person_id,
        bbox: face.insightface_bbox, // Use insightface_bbox
        verified: face.verified,
      })
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    // Process each photo
    for (const [photoId, faces] of photoMap.entries()) {
      const imageUrl = photoUrls.get(photoId)!

      try {
        const result = await apiFetch("/api/recognition/generate-descriptors", {
          method: "POST",
          body: JSON.stringify({
            image_url: imageUrl,
            faces: faces,
          }),
        })

        logger.debug("admin/actions", `Generated ${result.generated} descriptors for photo ${photoId}`)
        successCount += result.generated || 0
      } catch (fetchError: any) {
        logger.error("admin/actions", `Error processing photo ${photoId}`, fetchError)
        errors.push(`Photo ${photoId}: ${fetchError.message}`)
        errorCount++
      }
    }

    if (successCount > 0) {
      logger.debug("admin/actions", "Rebuilding HNSWLIB index after generating descriptors...")
      try {
        const rebuildResult = await apiFetch("/api/recognition/rebuild-index", {
          method: "POST",
        })

        logger.info("admin/actions", "✓ Index rebuilt successfully:", rebuildResult)
      } catch (rebuildError: any) {
        logger.error("admin/actions", "✗ Error rebuilding index:", rebuildError)
      }
    }

    revalidatePath("/admin")

    logger.info("admin/actions", `Generated missing descriptors. Processed: ${successCount}, Errors: ${errorCount}`)
    return {
      success: true,
      processed: successCount,
      errors: errorCount,
      errorDetails: errors.length > 0 ? errors : undefined,
      message: `Generated ${successCount} descriptors. ${errorCount > 0 ? `${errorCount} errors occurred.` : ""}`,
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error in generateMissingDescriptorsAction", error)
    return { error: error.message || "Failed to generate descriptors" }
  }
}

export async function rebuildRecognitionIndexAction() {
  try {
    logger.debug("admin/actions", "Calling rebuild-index endpoint...")

    const result = await apiFetch("/api/recognition/rebuild-index", {
      method: "POST",
    })

    logger.info("admin/actions", "Index rebuilt successfully:", result)

    return {
      success: result.success,
      oldCount: result.old_descriptor_count,
      newCount: result.new_descriptor_count,
      uniquePeople: result.unique_people_count,
      message: `Index rebuilt: ${result.new_descriptor_count} descriptors for ${result.unique_people_count} people`,
    }
  } catch (error: any) {
    logger.error("admin/actions", "Error rebuilding index", error)
    return { error: error.message || "Failed to rebuild index" }
  }
}

export async function assignClusterToPersonAction(
  personId: string,
  clusterFaces: { photo_id: string; descriptor: number[] }[],
) {
  logger.debug("admin/actions", "assignClusterToPersonAction started")
  logger.debug("admin/actions", "personId:", personId)
  logger.debug("admin/actions", "clusterFaces count:", clusterFaces.length)
  logger.debug(
    "admin/actions",
    "clusterFaces details:",
    clusterFaces.map((f) => ({
      photo_id: f.photo_id,
      has_descriptor: !!f.descriptor,
      descriptor_length: f.descriptor?.length || 0,
    })),
  )

  const supabase = await createClient()

  try {
    const validDescriptors = clusterFaces
      .filter((face) => face.descriptor && Array.isArray(face.descriptor) && face.descriptor.length > 0)
      .map((face) => ({
        person_id: personId,
        descriptor: face.descriptor,
        source_image_id: face.photo_id,
      }))

    logger.debug(
      "admin/actions",
      `Valid descriptors to insert: ${validDescriptors.length} out of ${clusterFaces.length}`,
    )

    if (validDescriptors.length > 0) {
      const { error: descriptorsError } = await supabase.from("face_descriptors").insert(validDescriptors)

      if (descriptorsError) {
        logger.error("admin/actions", "Error inserting descriptors", descriptorsError)
        throw descriptorsError
      }

      logger.debug("admin/actions", "Descriptors inserted successfully")
    } else {
      logger.warn("admin/actions", "No valid descriptors to insert")
    }

    for (const face of clusterFaces) {
      logger.debug("admin/actions", "Processing face for photo_id:", face.photo_id)
      logger.debug("admin/actions", "Has descriptor:", !!face.descriptor, "length:", face.descriptor?.length || 0)

      // Get all unassigned faces on this photo
      const { data: photoFaces, error: fetchError } = await supabase
        .from("photo_faces")
        .select("id, photo_id, insightface_descriptor")
        .eq("photo_id", face.photo_id)
        .is("person_id", null)

      if (fetchError) {
        logger.error("admin/actions", "Error fetching photo_faces", fetchError)
        continue
      }

      if (!photoFaces || photoFaces.length === 0) {
        logger.warn("admin/actions", "No unassigned photo_faces found for photo_id:", face.photo_id)
        continue
      }

      logger.debug("admin/actions", `Found photo_faces: ${photoFaces.length}`)
      logger.debug(
        "admin/actions",
        `photo_faces details:`,
        photoFaces.map((pf) => ({
          id: pf.id,
          has_descriptor: !!pf.insightface_descriptor,
          descriptor_type: typeof pf.insightface_descriptor,
        })),
      )

      let matchingFace = null

      if (face.descriptor && Array.isArray(face.descriptor) && face.descriptor.length > 0) {
        for (const pf of photoFaces) {
          if (!pf.insightface_descriptor) {
            logger.debug("admin/actions", "photo_face", pf.id, "has no descriptor, skipping")
            continue
          }

          let pfDescriptor: number[]
          if (typeof pf.insightface_descriptor === "string") {
            try {
              pfDescriptor = JSON.parse(pf.insightface_descriptor)
            } catch (e) {
              logger.error("admin/actions", "Failed to parse descriptor for photo_face", pf.id)
              continue
            }
          } else if (Array.isArray(pf.insightface_descriptor)) {
            pfDescriptor = pf.insightface_descriptor
          } else {
            logger.error(
              "admin/actions",
              "Unknown descriptor type for photo_face",
              pf.id,
              ":",
              typeof pf.insightface_descriptor,
            )
            continue
          }

          const similarity = cosineSimilarity(pfDescriptor, face.descriptor)
          logger.debug("admin/actions", "Similarity between photo_face", pf.id, "and cluster face:", similarity)

          if (similarity > 0.99) {
            matchingFace = pf
            logger.debug("admin/actions", "Found matching face with similarity:", similarity)
            break
          }
        }
      }

      if (!matchingFace && photoFaces.length === 1) {
        logger.debug("admin/actions", "Only one face on photo, using it as match")
        matchingFace = photoFaces[0]
      }

      if (!matchingFace) {
        logger.error("admin/actions", "No matching face found for photo_id:", face.photo_id)
        continue
      }

      logger.debug("admin/actions", "Matched photo_face:", matchingFace.id)

      const shouldBeVerified = true

      logger.debug("admin/actions", "shouldBeVerified:", shouldBeVerified)

      const { error: updateError } = await supabase
        .from("photo_faces")
        .update({
          person_id: personId,
          confidence: 1.0,
          verified: shouldBeVerified,
        })
        .eq("id", matchingFace.id)

      if (updateError) {
        logger.error("admin/actions", "Error updating photo_face", updateError)
      } else {
        logger.debug("admin/actions", "Successfully updated photo_face:", matchingFace.id)
      }
    }

    logger.info("admin/actions", "assignClusterToPersonAction completed successfully")
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error assigning cluster to person", error)
    return { success: false, error: error.message || "Failed to assign cluster to person" }
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    logger.warn("admin/actions", "Cosine similarity called with arrays of different lengths:", a.length, b.length)
    return 0
  }
  if (a.length === 0) return 1 // Empty arrays are considered identical

  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 1 // If one of the vectors is a zero vector, consider them identical

  return dotProduct / denominator
}

export async function markPhotoAsProcessedAction(photoId: string) {
  const supabase = await createClient()

  const { error } = await supabase.from("gallery_images").update({ has_been_processed: true }).eq("id", photoId)

  if (error) {
    logger.error("admin/actions", "Error marking photo as processed", error)
    return { success: false, error: error.message }
  }

  logger.info("admin/actions", "Photo marked as processed successfully", { photoId })
  return { success: true }
}

export async function checkDatabaseIntegrityAction() {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "Starting database integrity check...")

    const report = {
      photoFaces: {
        verifiedWithoutPerson: 0,
        verifiedWithWrongConfidence: 0,
        personWithoutConfidence: 0,
        nonExistentPerson: 0,
        nonExistentPhoto: 0,
        withoutDescriptors: 0,
        inconsistentPersonId: 0,
      },
      faceDescriptors: {
        orphaned: 0,
        nonExistentPerson: 0,
        withoutPerson: 0,
        withoutEmbedding: 0,
        duplicates: 0,
        inconsistentPersonId: 0,
      },
      photos: {},
      people: {
        withoutDescriptors: 0,
        withoutFaces: 0,
        duplicateNames: 0,
      },
      totalIssues: 0,
      details: {} as Record<string, any[]>,
    }

    logger.debug("admin/actions", "Step 1: Checking verified faces without person...")

    // 1. Photo Faces: verified=true но person_id=null
    const { data: verifiedWithoutPerson } = await supabase
      .from("photo_faces")
      .select("id, photo_id, verified")
      .eq("verified", true)
      .is("person_id", null)

    report.photoFaces.verifiedWithoutPerson = verifiedWithoutPerson?.length || 0
    if (verifiedWithoutPerson && verifiedWithoutPerson.length > 0) {
      report.details.verifiedWithoutPerson = verifiedWithoutPerson.slice(0, 10)
    }
    logger.debug("admin/actions", `Found ${report.photoFaces.verifiedWithoutPerson} verified faces without person`)

    logger.debug("admin/actions", "Step 2: Checking verified faces with wrong confidence...")

    // 2. Photo Faces: verified=true но recognition_confidence != 1.0
    const { data: verifiedWithWrongConfidence } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, recognition_confidence, verified")
      .eq("verified", true)
      .not("recognition_confidence", "eq", 1.0)

    report.photoFaces.verifiedWithWrongConfidence = verifiedWithWrongConfidence?.length || 0
    if (verifiedWithWrongConfidence && verifiedWithWrongConfidence.length > 0) {
      report.details.verifiedWithWrongConfidence = verifiedWithWrongConfidence.slice(0, 10)
    }
    logger.debug(
      "admin/actions",
      `Found ${report.photoFaces.verifiedWithWrongConfidence} verified faces with wrong confidence`,
    )

    logger.debug("admin/actions", "Step 3: Checking faces with person but without confidence...")

    // 3. Photo Faces: person_id NOT NULL но recognition_confidence IS NULL или = 0
    const { data: personWithoutConfidence } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, recognition_confidence")
      .not("person_id", "is", null)
      .or("recognition_confidence.is.null,recognition_confidence.eq.0")

    report.photoFaces.personWithoutConfidence = personWithoutConfidence?.length || 0
    if (personWithoutConfidence && personWithoutConfidence.length > 0) {
      report.details.personWithoutConfidence = personWithoutConfidence.slice(0, 10)
    }
    logger.debug(
      "admin/actions",
      `Found ${report.photoFaces.personWithoutConfidence} faces with person but without confidence`,
    )

    logger.debug("admin/actions", "Step 4: Checking faces with non-existent person...")

    // 4. Photo Faces: person_id ссылается на несуществующего игрока
    const { data: facesWithPerson } = await supabase
      .from("photo_faces")
      .select("id, person_id")
      .not("person_id", "is", null)

    if (facesWithPerson && facesWithPerson.length > 0) {
      const personIds = [...new Set(facesWithPerson.map((f) => f.person_id))]
      const { data: existingPeople } = await supabase.from("people").select("id").in("id", personIds)

      const existingIds = new Set(existingPeople?.map((p) => p.id) || [])
      const nonExistentPersonFaces = facesWithPerson.filter((f) => !existingIds.has(f.person_id!))

      report.photoFaces.nonExistentPerson = nonExistentPersonFaces.length
      if (nonExistentPersonFaces.length > 0) {
        report.details.nonExistentPersonFaces = nonExistentPersonFaces.slice(0, 10)
      }
    }
    logger.debug("admin/actions", `Found ${report.photoFaces.nonExistentPerson} faces with non-existent person`)

    logger.debug("admin/actions", "Step 5: Checking faces with non-existent photos...")

    // 5. Photo Faces: photo_id ссылается на несуществующее фото
    const { data: allFaces } = await supabase.from("photo_faces").select("id, photo_id")

    if (allFaces && allFaces.length > 0) {
      const facesWithPhotoId = allFaces.filter((f) => f.photo_id != null)
      const photoIds = [...new Set(facesWithPhotoId.map((f) => f.photo_id))]
      logger.debug("admin/actions", `Checking ${photoIds.length} unique photo IDs...`)

      const { data: existingPhotos } = await supabase.from("gallery_images").select("id").in("id", photoIds)

      const existingPhotoIds = new Set(existingPhotos?.map((p) => p.id) || [])
      const nonExistentPhotoFaces = facesWithPhotoId.filter((f) => !existingPhotoIds.has(f.photo_id))

      report.photoFaces.nonExistentPhoto = nonExistentPhotoFaces.length
      if (nonExistentPhotoFaces.length > 0) {
        report.details.nonExistentPhotoFaces = nonExistentPhotoFaces.slice(0, 10)
      }
      logger.debug("admin/actions", `Found ${report.photoFaces.nonExistentPhoto} faces with non-existent photo`)
    }

    logger.debug("admin/actions", "Step 6: Checking faces without descriptors...")

    // 6. Photo Faces: лица без дескрипторов
    const { data: allPhotoFaces_ } = await supabase.from("photo_faces").select("id")

    if (allPhotoFaces_ && allPhotoFaces_.length > 0) {
      const faceIds = allPhotoFaces_.map((f) => f.id)
      const { data: descriptorsForFaces } = await supabase
        .from("face_descriptors")
        .select("source_image_id")
        .in("source_image_id", faceIds)

      const facesWithDescriptors = new Set(descriptorsForFaces?.map((d) => d.source_image_id) || [])
      const facesWithoutDescriptors = allPhotoFaces_.filter((f) => !facesWithDescriptors.has(f.id))

      report.photoFaces.withoutDescriptors = facesWithoutDescriptors.length
      if (facesWithoutDescriptors.length > 0) {
        report.details.facesWithoutDescriptors = facesWithoutDescriptors.slice(0, 10)
      }
    }
    logger.debug("admin/actions", `Found ${report.photoFaces.withoutDescriptors} faces without descriptors`)

    logger.debug("admin/actions", "Step 7: Checking inconsistent person IDs...")

    // 7. Face Descriptors: несогласованность person_id между photo_faces и face_descriptors
    const { data: allDescriptorsWithFaces } = await supabase
      .from("face_descriptors")
      .select("id, source_image_id, person_id")

    if (allDescriptorsWithFaces && allDescriptorsWithFaces.length > 0) {
      const descriptorsWithSourceId = allDescriptorsWithFaces.filter((d) => d.source_image_id != null)
      const faceIds = [...new Set(descriptorsWithSourceId.map((d) => d.source_image_id))]
      const { data: facesData } = await supabase.from("photo_faces").select("id, person_id").in("id", faceIds)

      const facesMap = new Map(facesData?.map((f) => [f.id, f.person_id]) || [])
      const inconsistentPersonIds = descriptorsWithSourceId.filter((d) => {
        const facePersonId = facesMap.get(d.source_image_id)
        return facePersonId !== d.person_id
      })

      report.photoFaces.inconsistentPersonId = inconsistentPersonIds.length
      if (inconsistentPersonIds.length > 0) {
        report.details.inconsistentPersonIds = inconsistentPersonIds.slice(0, 10)
      }
    }
    logger.debug("admin/actions", `Found ${report.photoFaces.inconsistentPersonId} inconsistent person IDs`)

    logger.debug("admin/actions", "Step 8: Checking orphaned descriptors...")

    // 8. Face Descriptors: orphaned (source_image_id не существует)
    const { data: allDescriptors } = await supabase.from("face_descriptors").select("id, source_image_id")

    if (allDescriptors && allDescriptors.length > 0) {
      const faceIds = [...new Set(allDescriptors.map((d) => d.source_image_id).filter(Boolean))]
      logger.debug("admin/actions", `Checking ${faceIds.length} unique face IDs...`)

      const { data: existingFaces } = await supabase.from("photo_faces").select("id").in("id", faceIds)

      const existingFaceIds = new Set(existingFaces?.map((f) => f.id) || [])
      const orphanedDescriptors = allDescriptors.filter(
        (d) => d.source_image_id && !existingFaceIds.has(d.source_image_id),
      )

      report.faceDescriptors.orphaned = orphanedDescriptors.length
      if (orphanedDescriptors.length > 0) {
        report.details.orphanedDescriptors = orphanedDescriptors.slice(0, 10)
      }
      logger.debug("admin/actions", `Found ${report.faceDescriptors.orphaned} orphaned descriptors`)
    }

    logger.debug("admin/actions", "Step 9: Checking descriptors with non-existent person...")

    // 9. Face Descriptors: person_id ссылается на несуществующего игрока
    const { data: descriptorsWithPerson } = await supabase
      .from("face_descriptors")
      .select("id, person_id")
      .not("person_id", "is", null)

    if (descriptorsWithPerson && descriptorsWithPerson.length > 0) {
      const personIds = [...new Set(descriptorsWithPerson.map((d) => d.person_id))]
      const { data: existingPeople } = await supabase.from("people").select("id").in("id", personIds)

      const existingIds = new Set(existingPeople?.map((p) => p.id) || [])
      const nonExistentPersonDescriptors = descriptorsWithPerson.filter((d) => !existingIds.has(d.person_id!))

      report.faceDescriptors.nonExistentPerson = nonExistentPersonDescriptors.length
      if (nonExistentPersonDescriptors.length > 0) {
        report.details.nonExistentPersonDescriptors = nonExistentPersonDescriptors.slice(0, 10)
      }
    }
    logger.debug(
      "admin/actions",
      `Found ${report.faceDescriptors.nonExistentPerson} descriptors with non-existent person`,
    )

    logger.debug("admin/actions", "Step 10: Checking descriptors without person...")

    // 10. Face Descriptors: без person_id
    const { count: withoutPersonCount } = await supabase
      .from("face_descriptors")
      .select("id", { count: "exact", head: true })
      .is("person_id", null)

    report.faceDescriptors.withoutPerson = withoutPersonCount || 0
    logger.debug("admin/actions", `Found ${report.faceDescriptors.withoutPerson} descriptors without person`)

    logger.debug("admin/actions", "Step 11: Checking descriptors without embedding...")

    // 11. Face Descriptors: без descriptor
    const { count: withoutEmbeddingCount } = await supabase
      .from("face_descriptors")
      .select("id", { count: "exact", head: true })
      .is("descriptor", null)

    report.faceDescriptors.withoutEmbedding = withoutEmbeddingCount || 0
    logger.debug("admin/actions", `Found ${report.faceDescriptors.withoutEmbedding} descriptors without embedding`)

    logger.debug("admin/actions", "Step 12: Checking duplicate descriptors...")

    // 12. Face Descriptors: дубликаты
    const { data: allDescriptorsForDuplicates } = await supabase
      .from("face_descriptors")
      .select("id, source_image_id")
      .not("source_image_id", "is", null)

    if (allDescriptorsForDuplicates && allDescriptorsForDuplicates.length > 0) {
      const sourceImageCounts = new Map<string, number>()
      allDescriptorsForDuplicates.forEach((d) => {
        const count = sourceImageCounts.get(d.source_image_id) || 0
        sourceImageCounts.set(d.source_image_id, count + 1)
      })

      const duplicateSourceImages = Array.from(sourceImageCounts.entries())
        .filter(([_, count]) => count > 1)
        .map(([sourceImageId]) => sourceImageId)

      const duplicateDescriptors = allDescriptorsForDuplicates.filter((d) =>
        duplicateSourceImages.includes(d.source_image_id),
      )

      report.faceDescriptors.duplicates = duplicateDescriptors.length
      if (duplicateDescriptors.length > 0) {
        report.details.duplicateDescriptors = duplicateDescriptors.slice(0, 10)
      }
    }
    logger.debug("admin/actions", `Found ${report.faceDescriptors.duplicates} duplicate descriptors`)

    // 13. Photos: неправильный face_count - УДАЛЕНО
    // 14. Photos: face_count > 0 но нет лиц - УДАЛЕНО

    logger.debug("admin/actions", "Step 15: Checking people without descriptors...")

    // 15. People: без дескрипторов
    const { data: allPeople } = await supabase.from("people").select("id, real_name")

    if (allPeople && allPeople.length > 0) {
      const peopleIds = allPeople.map((p) => p.id)
      const { data: descriptorsForPeople } = await supabase
        .from("face_descriptors")
        .select("person_id")
        .in("person_id", peopleIds)
        .not("person_id", "is", null)

      const peopleWithDescriptors = new Set(descriptorsForPeople?.map((d) => d.person_id) || [])
      const peopleWithoutDescriptors = allPeople.filter((p) => !peopleWithDescriptors.has(p.id))

      report.people.withoutDescriptors = peopleWithoutDescriptors.length
      if (peopleWithoutDescriptors.length > 0) {
        report.details.peopleWithoutDescriptors = peopleWithoutDescriptors.slice(0, 10)
      }
    }
    logger.debug("admin/actions", `Found ${report.people.withoutDescriptors} people without descriptors`)

    logger.debug("admin/actions", "Step 16: Checking people without faces...")

    // 16. People: без фото
    if (allPeople && allPeople.length > 0) {
      const peopleIds = allPeople.map((p) => p.id)
      const { data: facesForPeople } = await supabase
        .from("photo_faces")
        .select("person_id")
        .in("person_id", peopleIds)
        .not("person_id", "is", null)

      const peopleWithFaces = new Set(facesForPeople?.map((f) => f.person_id) || [])
      const peopleWithoutFaces = allPeople.filter((p) => !peopleWithFaces.has(p.id))

      report.people.withoutFaces = peopleWithoutFaces.length
      if (peopleWithoutFaces.length > 0) {
        report.details.peopleWithoutFaces = peopleWithoutFaces.slice(0, 10)
      }
    }
    logger.debug("admin/actions", `Found ${report.people.withoutFaces} people without faces`)

    logger.debug("admin/actions", "Step 17: Checking duplicate people names...")

    // 17. People: дубликаты имен
    if (allPeople && allPeople.length > 0) {
      const nameCounts = new Map<string, number>()
      allPeople.forEach((p) => {
        if (p.real_name) {
          const count = nameCounts.get(p.real_name) || 0
          nameCounts.set(p.real_name, count + 1)
        }
      })

      const duplicateNames = Array.from(nameCounts.entries())
        .filter(([_, count]) => count > 1)
        .map(([name]) => name)

      const peopleWithDuplicateNames = allPeople.filter((p) => p.real_name && duplicateNames.includes(p.real_name))

      report.people.duplicateNames = peopleWithDuplicateNames.length
      if (peopleWithDuplicateNames.length > 0) {
        report.details.duplicateNames = peopleWithDuplicateNames.slice(0, 10)
      }
    }
    logger.debug("admin/actions", `Found ${report.people.duplicateNames} people with duplicate names`)

    // Подсчет общего количества проблем
    report.totalIssues =
      report.photoFaces.verifiedWithoutPerson +
      report.photoFaces.verifiedWithWrongConfidence +
      report.photoFaces.personWithoutConfidence +
      report.photoFaces.nonExistentPerson +
      report.photoFaces.nonExistentPhoto +
      report.photoFaces.withoutDescriptors +
      report.photoFaces.inconsistentPersonId +
      report.faceDescriptors.orphaned +
      report.faceDescriptors.nonExistentPerson +
      report.faceDescriptors.withoutPerson +
      report.faceDescriptors.withoutEmbedding +
      report.faceDescriptors.duplicates +
      report.people.withoutDescriptors +
      report.people.withoutFaces +
      report.people.duplicateNames

    logger.info("admin/actions", `Integrity check complete. Total issues: ${report.totalIssues}`)

    return { success: true, data: report }
  } catch (error: any) {
    logger.error("admin/actions", "Error checking database integrity", error)
    return { success: false, error: error.message || "Failed to check database integrity" }
  }
}

export async function fixIntegrityIssueAction(issueType: string, options?: any) {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", `Fixing integrity issue: ${issueType}`, options)

    let fixed = 0

    switch (issueType) {
      case "verifiedWithoutPerson": {
        // Сбросить verified=false для лиц без person_id
        const { error } = await supabase
          .from("photo_faces")
          .update({ verified: false, recognition_confidence: null })
          .eq("verified", true)
          .is("person_id", null)

        if (error) throw error

        const { count } = await supabase
          .from("photo_faces")
          .select("id", { count: "exact", head: true })
          .eq("verified", false)
          .is("person_id", null)

        fixed = count || 0
        break
      }

      case "verifiedWithWrongConfidence": {
        // Установить recognition_confidence=1.0 для verified=true
        const { error } = await supabase
          .from("photo_faces")
          .update({ recognition_confidence: 1.0 })
          .eq("verified", true)
          .not("recognition_confidence", "eq", 1.0)

        if (error) throw error

        const { count } = await supabase
          .from("photo_faces")
          .select("id", { count: "exact", head: true })
          .eq("verified", true)
          .eq("recognition_confidence", 1.0)

        fixed = count || 0
        break
      }

      case "personWithoutConfidence": {
        // Установить recognition_confidence=1.0 если verified=true, иначе 0.8
        const { data: faces } = await supabase
          .from("photo_faces")
          .select("id, verified")
          .not("person_id", "is", null)
          .or("recognition_confidence.is.null,recognition_confidence.eq.0")

        if (faces && faces.length > 0) {
          for (const face of faces) {
            const confidence = face.verified ? 1.0 : 0.8
            await supabase.from("photo_faces").update({ recognition_confidence: confidence }).eq("id", face.id)
          }
          fixed = faces.length
        }
        break
      }

      case "nonExistentPersonFaces": {
        // Обнулить person_id, verified, recognition_confidence для лиц с несуществующим person_id
        const { data: facesWithPerson } = await supabase
          .from("photo_faces")
          .select("id, person_id")
          .not("person_id", "is", null)

        if (facesWithPerson && facesWithPerson.length > 0) {
          const personIds = [...new Set(facesWithPerson.map((f) => f.person_id))]
          const { data: existingPeople } = await supabase.from("people").select("id").in("id", personIds)

          const existingIds = new Set(existingPeople?.map((p) => p.id) || [])
          const nonExistentPersonFaces = facesWithPerson.filter((f) => !existingIds.has(f.person_id!))

          for (const face of nonExistentPersonFaces) {
            await supabase
              .from("photo_faces")
              .update({ person_id: null, verified: false, recognition_confidence: null })
              .eq("id", face.id)
          }
          fixed = nonExistentPersonFaces.length
        }
        break
      }

      case "nonExistentPhotoFaces": {
        // Удалить лица с несуществующим photo_id
        const { data: allFaces } = await supabase.from("photo_faces").select("id, photo_id")

        if (allFaces && allFaces.length > 0) {
          const photoIds = [...new Set(allFaces.map((f) => f.photo_id))]
          const { data: existingPhotos } = await supabase.from("gallery_images").select("id").in("id", photoIds)

          const existingPhotoIds = new Set(existingPhotos?.map((p) => p.id) || [])
          const nonExistentPhotoFaces = allFaces.filter((f) => !existingPhotoIds.has(f.photo_id))

          for (const face of nonExistentPhotoFaces) {
            await supabase.from("photo_faces").delete().eq("id", face.id)
          }
          fixed = nonExistentPhotoFaces.length
        }
        break
      }

      case "orphanedDescriptors": {
        // Удалить дескрипторы с несуществующим source_image_id
        const { data: allDescriptors } = await supabase.from("face_descriptors").select("id, source_image_id")

        if (allDescriptors && allDescriptors.length > 0) {
          const faceIds = [...new Set(allDescriptors.map((d) => d.source_image_id).filter(Boolean))]
          const { data: existingFaces } = await supabase.from("photo_faces").select("id").in("id", faceIds)

          const existingFaceIds = new Set(existingFaces?.map((f) => f.id) || [])
          const orphanedDescriptors = allDescriptors.filter(
            (d) => d.source_image_id && !existingFaceIds.has(d.source_image_id),
          )

          for (const descriptor of orphanedDescriptors) {
            await supabase.from("face_descriptors").delete().eq("id", descriptor.id)
          }
          fixed = orphanedDescriptors.length
        }
        break
      }

      case "nonExistentPersonDescriptors": {
        // Обнулить person_id для дескрипторов с несуществующим person_id
        const { data: descriptorsWithPerson } = await supabase
          .from("face_descriptors")
          .select("id, person_id")
          .not("person_id", "is", null)

        if (descriptorsWithPerson && descriptorsWithPerson.length > 0) {
          const personIds = [...new Set(descriptorsWithPerson.map((d) => d.person_id))]
          const { data: existingPeople } = await supabase.from("people").select("id").in("id", personIds)

          const existingIds = new Set(existingPeople?.map((p) => p.id) || [])
          const nonExistentPersonDescriptors = descriptorsWithPerson.filter((d) => !existingIds.has(d.person_id!))

          for (const descriptor of nonExistentPersonDescriptors) {
            await supabase.from("face_descriptors").update({ person_id: null }).eq("id", descriptor.id)
          }
          fixed = nonExistentPersonDescriptors.length
        }
        break
      }

      default:
        logger.error("admin/actions", `Unknown issue type: ${issueType}`)
        return { success: false, error: `Unknown issue type: ${issueType}` }
    }

    logger.info("admin/actions", `Fixed ${fixed} issues of type ${issueType}`)
    return { success: true, data: { fixed, issueType } }
  } catch (error: any) {
    logger.error("admin/actions", "Error fixing integrity issue", error)
    return { success: false, error: error.message || "Failed to fix integrity issue" }
  }
}

export async function unlinkPersonFromPhotoAction(photoId: string, personId: string) {
  const supabase = await createClient()

  try {
    logger.debug("admin/actions", "unlinkPersonFromPhotoAction: Starting", { photoId, personId })

    // Delete face descriptors as they are tied to specific person
    const { error: descError } = await supabase
      .from("face_descriptors")
      .delete()
      .eq("source_image_id", photoId)
      .eq("person_id", personId)

    if (descError) throw descError
    logger.debug("admin/actions", "unlinkPersonFromPhotoAction: Deleted face descriptors")

    // Update photo_faces to unlink person and remove verification in ONE query
    const { data: updatedFaces, error: faceError } = await supabase
      .from("photo_faces")
      .update({
        person_id: null,
        verified: false,
        verified_at: null,
        verified_by: null,
        recognition_confidence: null,
      })
      .eq("photo_id", photoId)
      .eq("person_id", personId)
      .select()

    if (faceError) throw faceError
    logger.debug("admin/actions", "unlinkPersonFromPhotoAction: Updated photo_faces", { updatedFaces })

    revalidatePath("/admin")
    logger.info("admin/actions", "Person unlinked from photo successfully", { photoId, personId })
    return { success: true }
  } catch (error: any) {
    logger.error("admin/actions", "Error unlinking person from photo", error)
    return { error: error.message || "Failed to unlink person from photo" }
  }
}
