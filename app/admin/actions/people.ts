"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { logger } from "@/lib/logger"
import { safeSupabaseCall } from "@/lib/supabase/safe-call"

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

    logger.debug("actions/people", `Found ${photos?.length || 0} photos for person ${personId}`)
    return { success: true, data: photos || [] }
  } catch (error: any) {
    logger.error("actions/people", "Error getting person photos", error)
    return { error: error.message || "Failed to get person photos" }
  }
}

export async function getPersonPhotosWithDetailsAction(personId: string) {
  const supabase = await createClient()

  try {
    logger.debug("actions/people", "===== getPersonPhotosWithDetailsAction START =====")
    logger.debug("actions/people", "Querying photos for person_id:", personId)

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
    const photoFaces = allPhotoFaces_.filter((pf) => {
      if (pf.verified === true) return true
      return pf.confidence && pf.confidence >= 0.6
    })

    logger.debug("actions/people", `Found ${allPhotoFaces_.length} total, ${photoFaces.length} after filtering`)

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
        const facesForPerson = facesByPhotoForPerson.get(photoId) || []
        const isVerified = facesForPerson.some((face) => face.verified === true)

        photosMap.set(photoId, {
          ...pf.gallery_images,
          faceId: pf.id,
          confidence: pf.confidence,
          verified: isVerified,
          boundingBox: pf.insightface_bbox,
          shootDate: pf.gallery_images.galleries?.shoot_date || null,
          filename: pf.gallery_images.original_filename || "",
          gallery_name: pf.gallery_images.galleries?.title || null,
        })
      }
    }

    const photos = Array.from(photosMap.values())
    const photoIds = photos.map((p) => p.id)

    const { data: allPhotoFaces, error: facesError } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, verified, confidence, people(real_name, telegram_name)")
      .in("photo_id", photoIds)
      .or(`verified.eq.true,confidence.gte.0.6`)

    if (facesError) throw facesError

    const otherFacesByPhoto = new Map<string, any[]>()
    for (const face of allPhotoFaces || []) {
      if (face.person_id === personId) continue
      if (!otherFacesByPhoto.has(face.photo_id)) {
        otherFacesByPhoto.set(face.photo_id, [])
      }
      otherFacesByPhoto.get(face.photo_id)!.push({
        personName: face.people?.real_name || face.people?.telegram_name || "Unknown",
        verified: face.verified,
        confidence: face.confidence,
      })
    }

    const photosWithOtherFaces = photos.map((photo) => ({
      ...photo,
      otherFaces: otherFacesByPhoto.get(photo.id) || [],
    }))

    logger.debug("actions/people", "Returning", photosWithOtherFaces.length, "unique photos")
    logger.debug("actions/people", "===== getPersonPhotosWithDetailsAction END =====")

    return { success: true, data: photosWithOtherFaces }
  } catch (error: any) {
    logger.error("actions/people", "Error getting person photos with details", error)
    return { error: error.message || "Failed to get person photos with details" }
  }
}

export async function updatePersonAvatarAction(personId: string, avatarUrl: string) {
  const supabase = await createClient()

  try {
    const { error } = await supabase.from("people").update({ avatar_url: avatarUrl }).eq("id", personId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/people", "Person avatar updated successfully", { personId, avatarUrl })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/people", "Error updating person avatar", error)
    return { error: error.message || "Failed to update person avatar" }
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
      .eq("person_id", personId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/people", "Person verified on photo successfully", { photoId, personId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/people", "Error verifying person on photo", error)
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
    logger.info("actions/people", "Person visibility updated successfully", { personId, field, value })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/people", "Error updating person visibility", error)
    return { error: error.message || "Failed to update person visibility" }
  }
}

export async function unlinkPersonFromPhotoAction(photoId: string, personId: string) {
  const supabase = await createClient()

  try {
    logger.debug("actions/people", "unlinkPersonFromPhotoAction: Starting", { photoId, personId })

    const { data: updatedFaces, error: faceError } = await supabase
      .from("photo_faces")
      .update({
        person_id: null,
        verified: false,
        verified_at: null,
        verified_by: null,
        confidence: null,
      })
      .eq("photo_id", photoId)
      .eq("person_id", personId)
      .select()

    if (faceError) throw faceError
    logger.debug("actions/people", "unlinkPersonFromPhotoAction: Updated photo_faces", { updatedFaces })

    revalidatePath("/admin")
    logger.info("actions/people", "Person unlinked from photo successfully", { photoId, personId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/people", "Error unlinking person from photo", error)
    return { error: error.message || "Failed to unlink person from photo" }
  }
}
