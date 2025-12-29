"use server"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { IntegrityActionResult } from "./types"
import { CONFIDENCE_100_THRESHOLD } from "./constants"
import { getConfidenceThreshold } from "./utils"

/**
 * Получить детальную информацию о конкретной проблеме
 */
export async function getIssueDetailsAction(
  issueType: string,
  limit = 50
): Promise<IntegrityActionResult<any[]>> {
  const supabase = await createClient()

  try {
    let details: any[] = []

    switch (issueType) {
      case "verifiedWithoutPerson": {
        const { data } = await supabase
          .from("photo_faces")
          .select(`
            id, photo_id, insightface_bbox,
            gallery_images(id, image_url, gallery_id, galleries(title))
          `)
          .eq("verified", true)
          .is("person_id", null)
          .limit(limit)

        details = (data || []).map((item: any) => ({
          ...item,
          bbox: item.insightface_bbox,
          image_url: item.gallery_images?.image_url,
          gallery_title: item.gallery_images?.galleries?.title,
        }))
        break
      }

      case "confidenceWithoutVerified": {
        const { data } = await supabase
          .from("photo_faces")
          .select(`
            id, photo_id, person_id, recognition_confidence, verified, insightface_bbox,
            gallery_images(id, image_url, galleries(title)),
            people(real_name)
          `)
          .gte("recognition_confidence", CONFIDENCE_100_THRESHOLD)
          .eq("verified", false)
          .limit(limit)

        details = (data || []).map((item: any) => ({
          id: item.id,
          photo_id: item.photo_id,
          person_id: item.person_id,
          person_name: item.people?.real_name || "Unknown",
          confidence: item.recognition_confidence,
          verified: item.verified,
          bbox: item.insightface_bbox,
          image_url: item.gallery_images?.image_url,
          gallery_title: item.gallery_images?.galleries?.title,
        }))
        break
      }

      case "orphanedLinks": {
        const confidenceThreshold = await getConfidenceThreshold()
        const { data } = await supabase
          .from("photo_faces")
          .select(`
            id, photo_id, person_id, verified, recognition_confidence, insightface_bbox,
            gallery_images(id, image_url, galleries(title)),
            people(real_name)
          `)
          .not("person_id", "is", null)
          .not("insightface_descriptor", "is", null)
          .eq("verified", false)
          .limit(200)

        details = (data || [])
          .filter((f: any) => (f.recognition_confidence || 0) < confidenceThreshold)
          .slice(0, limit)
          .map((item: any) => ({
            id: item.id,
            photo_id: item.photo_id,
            person_id: item.person_id,
            person_name: item.people?.real_name || "Unknown",
            confidence: item.recognition_confidence,
            verified: item.verified,
            bbox: item.insightface_bbox,
            image_url: item.gallery_images?.image_url,
            gallery_title: item.gallery_images?.galleries?.title,
          }))
        break
      }

      case "unrecognizedFaces": {
        const { data } = await supabase
          .from("photo_faces")
          .select("id, insightface_descriptor")
          .is("person_id", null)
          .not("insightface_descriptor", "is", null)
          .limit(limit)

        details = (data || []).map((item: any) => ({
          ...item,
          descriptor: item.insightface_descriptor,
        }))
        break
      }

      default:
        return { success: false, error: `Unknown issue type: ${issueType}` }
    }

    return { success: true, data: details }
  } catch (error: any) {
    logger.error("actions/integrity", "Error getting issue details", error)
    return { success: false, error: error.message || "Failed to get issue details" }
  }
}

/**
 * Подтвердить лицо (верифицировать или установить confidence)
 */
export async function confirmFaceAction(
  faceId: string,
  actionType: "verify" | "elevate",
  threshold?: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    if (actionType === "verify") {
      return { success: false, error: "Use FaceTaggingDialog for verification" }
    } else {
      const confidenceValue = threshold || (await getConfidenceThreshold())
      const { error } = await supabase
        .from("photo_faces")
        .update({ recognition_confidence: confidenceValue })
        .eq("id", faceId)

      if (error) throw error
    }

    return { success: true }
  } catch (error: any) {
    console.error("[confirmFaceAction] Error:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Отклонить лицо (снять верификацию или удалить person_id)
 */
export async function rejectFaceAction(
  faceId: string,
  actionType: "unverify" | "unlink"
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    if (actionType === "unverify") {
      const { error } = await supabase
        .from("photo_faces")
        .update({
          verified: false,
          recognition_confidence: null,
        })
        .eq("id", faceId)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from("photo_faces")
        .update({
          person_id: null,
          recognition_confidence: null,
        })
        .eq("id", faceId)

      if (error) throw error
    }

    return { success: true }
  } catch (error: any) {
    console.error("[rejectFaceAction] Error:", error)
    return { success: false, error: error.message }
  }
}
