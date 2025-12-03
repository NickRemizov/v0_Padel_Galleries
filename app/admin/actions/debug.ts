"use server"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

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

    logger.debug("actions/debug", `Debug: Found person ${person.real_name} (${person.id})`)

    const { data: photoFaces, error: facesError } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, confidence, verified, gallery_images(id, original_filename, gallery_id)")
      .eq("person_id", person.id)

    if (facesError) throw facesError

    logger.debug("actions/debug", `Debug: Found ${photoFaces?.length || 0} photo_faces for ${person.real_name}`)

    const photoIds = [...new Set(photoFaces?.map((pf) => pf.photo_id) || [])]
    logger.debug("actions/debug", `Debug: Unique photos: ${photoIds.length}`)

    const photoDetails = []
    for (const photoId of photoIds) {
      const { data: allFacesOnPhoto, error: allFacesError } = await supabase
        .from("photo_faces")
        .select("id, person_id, confidence, verified, people(real_name, telegram_name)")
        .eq("photo_id", photoId)

      if (allFacesError) {
        logger.error("actions/debug", `Error getting faces for photo ${photoId}`, allFacesError)
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

      photoDetails.push({
        photoId,
        filename,
        faces: facesInfo,
      })
    }

    photoDetails.sort((a, b) => a.filename.localeCompare(b.filename))

    logger.debug(`[v0] ========== DEBUG: Photos for ${person.real_name} ==========`)
    logger.debug(`[v0] Total photo_faces: ${photoFaces?.length || 0}`)
    logger.debug(`[v0] Unique photos: ${photoIds.length}`)

    photoDetails.forEach((photo, index) => {
      logger.debug(`\n[v0] Photo ${index + 1}: ${photo.filename}`)
      logger.debug(`[v0]   Photo ID: ${photo.photoId}`)
      logger.debug(`[v0]   Total faces: ${photo.faces.length}`)
      photo.faces.forEach((face, faceIndex) => {
        logger.debug(
          `[v0]   Face ${faceIndex + 1}: ${face.personName} (verified=${face.verified}, confidence=${face.confidence})`,
        )
      })
    })

    return {
      success: true,
      data: {
        personName: person.real_name,
        totalPhotoFaces: photoFaces?.length || 0,
        uniquePhotos: photoIds.length,
        photoDetails,
      },
    }
  } catch (error: any) {
    logger.error("actions/debug", "Error in debug person photos", error)
    return { error: error.message || "Failed to debug person photos" }
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

    logger.debug("actions/debug", `Debug: Found photo ${photo.original_filename} (${photo.id})`)

    const { data: photoFaces, error: facesError } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, confidence, verified, insightface_bbox, people(real_name, telegram_name)")
      .eq("photo_id", photo.id)

    if (facesError) throw facesError

    logger.debug("actions/debug", `Debug: Found ${photoFaces?.length || 0} faces on photo`)

    logger.debug(`\n[v0] ========== DEBUG: Faces on photo "${photo.original_filename}" ==========`)
    logger.debug(`[v0] Photo ID: ${photo.id}`)
    logger.debug(`[v0] Gallery ID: ${photo.gallery_id}`)
    logger.debug(`[v0] Total faces detected: ${photoFaces?.length || 0}`)

    photoFaces?.forEach((face, index) => {
      const personName = face.people?.real_name || face.people?.telegram_name || "Unknown"
      logger.debug(`\n[v0] Face ${index + 1}:`)
      logger.debug(`[v0]   Person: ${personName}`)
      logger.debug(`[v0]   Verified: ${face.verified}`)
      logger.debug(`[v0]   Confidence: ${face.confidence}`)
      logger.debug(`[v0]   Bounding Box:`, face.insightface_bbox)
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
            boundingBox: face.insightface_bbox,
          })) || [],
      },
    }
  } catch (error: any) {
    logger.error("actions/debug", "Error in debug photo faces", error)
    return { error: error.message || "Failed to debug photo faces" }
  }
}

export async function checkDatabaseIntegrityAction() {
  const supabase = await createClient()

  try {
    logger.debug("actions/debug", "Starting database integrity check...")

    const report = {
      photoFaces: {
        verifiedWithoutPerson: 0,
        verifiedWithWrongConfidence: 0,
        personWithoutConfidence: 0,
        nonExistentPerson: 0,
        nonExistentPhoto: 0,
      },
      people: {
        withoutFaces: 0,
      },
      totalIssues: 0,
      details: {} as Record<string, any[]>,
    }

    // Check verified faces without person
    const { data: verifiedWithoutPerson } = await supabase
      .from("photo_faces")
      .select("id, photo_id, verified")
      .eq("verified", true)
      .is("person_id", null)

    report.photoFaces.verifiedWithoutPerson = verifiedWithoutPerson?.length || 0
    if (verifiedWithoutPerson && verifiedWithoutPerson.length > 0) {
      report.details.verifiedWithoutPerson = verifiedWithoutPerson.slice(0, 10)
    }

    // Check verified faces with wrong confidence
    const { data: verifiedWithWrongConfidence } = await supabase
      .from("photo_faces")
      .select("id, photo_id, person_id, confidence, verified")
      .eq("verified", true)
      .not("confidence", "eq", 1.0)

    report.photoFaces.verifiedWithWrongConfidence = verifiedWithWrongConfidence?.length || 0
    if (verifiedWithWrongConfidence && verifiedWithWrongConfidence.length > 0) {
      report.details.verifiedWithWrongConfidence = verifiedWithWrongConfidence.slice(0, 10)
    }

    // Calculate total issues
    report.totalIssues =
      report.photoFaces.verifiedWithoutPerson +
      report.photoFaces.verifiedWithWrongConfidence +
      report.photoFaces.personWithoutConfidence +
      report.photoFaces.nonExistentPerson +
      report.photoFaces.nonExistentPhoto +
      report.people.withoutFaces

    logger.info("actions/debug", `Integrity check complete. Total issues: ${report.totalIssues}`)

    return { success: true, data: report }
  } catch (error: any) {
    logger.error("actions/debug", "Error checking database integrity", error)
    return { success: false, error: error.message || "Failed to check database integrity" }
  }
}

export async function fixIntegrityIssueAction(issueType: string, options?: any) {
  const supabase = await createClient()

  try {
    logger.debug("actions/debug", `Fixing integrity issue: ${issueType}`, options)

    let fixed = 0

    switch (issueType) {
      case "verifiedWithoutPerson": {
        const { error } = await supabase
          .from("photo_faces")
          .update({ verified: false, confidence: null })
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
        const { error } = await supabase
          .from("photo_faces")
          .update({ confidence: 1.0 })
          .eq("verified", true)
          .not("confidence", "eq", 1.0)

        if (error) throw error

        const { count } = await supabase
          .from("photo_faces")
          .select("id", { count: "exact", head: true })
          .eq("verified", true)
          .eq("confidence", 1.0)

        fixed = count || 0
        break
      }

      default:
        return { success: false, error: `Unknown issue type: ${issueType}` }
    }

    logger.info("actions/debug", `Fixed ${fixed} issues of type ${issueType}`)
    return { success: true, data: { fixed, issueType } }
  } catch (error: any) {
    logger.error("actions/debug", "Error fixing integrity issue", error)
    return { success: false, error: error.message || "Failed to fix integrity issue" }
  }
}

export async function getPhotosWithExcessDescriptorsAction() {
  logger.warn(
    "actions/debug",
    "getPhotosWithExcessDescriptorsAction is deprecated - descriptors are managed automatically",
  )
  return {
    success: true,
    data: {
      photos: [],
      message:
        "This function is deprecated. Descriptors are now managed automatically by the backend recognition system.",
    },
  }
}
