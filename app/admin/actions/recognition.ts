"use server"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

export async function getRecognitionStatsAction() {
  const supabase = await createClient()

  if (!supabase) {
    logger.error("actions/recognition", "Supabase client is null")
    return { error: "Database connection failed" }
  }

  logger.debug("actions/recognition", "[getRecognitionStatsAction] Starting...")

  try {
    const { count: peopleCount, error: peopleError } = await supabase
      .from("people")
      .select("*", { count: "exact", head: true })

    if (peopleError) throw peopleError
    logger.debug("actions/recognition", `Total people: ${peopleCount}`)

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

    logger.debug("actions/recognition", `Loaded ${allPhotoFaces.length} photo_faces records total`)

    const verifiedCount = allPhotoFaces.filter((pf) => pf.verified).length
    const highConfidenceCount = allPhotoFaces.filter(
      (pf) => pf.confidence && pf.confidence >= 0.6 && !pf.verified,
    ).length

    logger.debug("actions/recognition", `Total verified faces: ${verifiedCount}`)
    logger.debug("actions/recognition", `Total high confidence (not verified) faces: ${highConfidenceCount}`)

    const { data: peopleData, error: peopleDataError } = await supabase
      .from("people")
      .select("id, real_name, telegram_name")
      .order("real_name")

    if (peopleDataError) throw peopleDataError

    const facesByPerson = new Map<string, any[]>()
    for (const face of allPhotoFaces) {
      if (!face.person_id) continue
      if (!facesByPerson.has(face.person_id)) {
        facesByPerson.set(face.person_id, [])
      }
      facesByPerson.get(face.person_id)!.push(face)
    }

    const peopleStats = []
    for (const person of peopleData || []) {
      const photoFaces = facesByPerson.get(person.id) || []

      const verifiedPhotoIds = new Set(photoFaces.filter((pf) => pf.verified).map((pf) => pf.photo_id))
      const highConfPhotoIds = new Set(
        photoFaces.filter((pf) => pf.confidence && pf.confidence >= 0.6 && !pf.verified).map((pf) => pf.photo_id),
      )

      const totalConfirmed = verifiedPhotoIds.size + highConfPhotoIds.size

      peopleStats.push({
        id: person.id,
        name: person.real_name,
        telegramName: person.telegram_name,
        verifiedPhotos: verifiedPhotoIds.size,
        highConfidencePhotos: highConfPhotoIds.size,
        totalConfirmed: totalConfirmed,
      })
    }

    peopleStats.sort((a, b) => b.totalConfirmed - a.totalConfirmed)

    logger.debug("actions/recognition", "Completed getRecognitionStatsAction successfully")

    return {
      success: true,
      data: {
        summary: {
          totalPeople: peopleCount || 0,
          totalVerifiedFaces: verifiedCount,
          totalHighConfidenceFaces: highConfidenceCount,
        },
        peopleStats: peopleStats,
      },
    }
  } catch (error: any) {
    logger.error("actions/recognition", "Error getting recognition stats", error)
    return { error: error.message || "Failed to get recognition stats" }
  }
}
