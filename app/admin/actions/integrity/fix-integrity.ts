"use server"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import type { IntegrityActionResult, FixResult } from "./types"
import { CONFIDENCE_100_THRESHOLD } from "./constants"
import { getConfidenceThreshold, loadAllPhotoFaces } from "./utils"

/**
 * Автоматическое исправление проблем целостности
 * Только БЕЗОПАСНЫЕ операции
 */
export async function fixIntegrityIssuesAction(
  issueType: string
): Promise<IntegrityActionResult<FixResult>> {
  const supabase = await createClient()

  try {
    logger.debug("actions/integrity", `Fixing integrity issue: ${issueType}`)

    let fixed = 0
    const details: any = {}

    switch (issueType) {
      case "verifiedWithoutPerson": {
        const { data: updated, error } = await supabase
          .from("photo_faces")
          .update({ verified: false, recognition_confidence: null })
          .eq("verified", true)
          .is("person_id", null)
          .select("id")

        if (error) throw error
        fixed = updated?.length || 0
        details.updatedIds = updated?.map((u: any) => u.id)
        break
      }

      case "verifiedWithWrongConfidence": {
        const { data: updated, error } = await supabase
          .from("photo_faces")
          .update({ recognition_confidence: 1.0 })
          .eq("verified", true)
          .lt("recognition_confidence", CONFIDENCE_100_THRESHOLD)
          .select("id")

        if (error) throw error
        fixed = updated?.length || 0
        details.updatedIds = updated?.map((u: any) => u.id)
        break
      }

      case "confidenceWithoutVerified": {
        // v2.1: Using pagination to fix ALL records
        const allToFix = await loadAllPhotoFaces<{ id: string }>(
          supabase,
          "id",
          (q) => q.gte("recognition_confidence", CONFIDENCE_100_THRESHOLD).eq("verified", false)
        )
        console.log(`[v2.1] Found ${allToFix.length} faces to fix for confidenceWithoutVerified`)

        if (allToFix.length > 0) {
          const idsToFix = allToFix.map((f) => f.id)

          // Update батчами
          for (let i = 0; i < idsToFix.length; i += 500) {
            const batch = idsToFix.slice(i, i + 500)
            const { error } = await supabase
              .from("photo_faces")
              .update({ verified: true })
              .in("id", batch)

            if (error) throw error
          }

          fixed = idsToFix.length
          details.updatedIds = idsToFix.slice(0, 100)
        }
        break
      }

      case "personWithoutConfidence": {
        const { data: updated, error } = await supabase
          .from("photo_faces")
          .update({ recognition_confidence: 0.5 })
          .not("person_id", "is", null)
          .is("recognition_confidence", null)
          .select("id")

        if (error) throw error
        fixed = updated?.length || 0
        details.updatedIds = updated?.map((u: any) => u.id)
        break
      }

      case "nonExistentPersonFaces": {
        // С ПАГИНАЦИЕЙ
        const allPhotoFaces = await loadAllPhotoFaces<{ id: string; person_id: string }>(
          supabase,
          "id, person_id",
          (q) => q.not("person_id", "is", null)
        )
        console.log(`[v2.1] Loaded ${allPhotoFaces.length} photo_faces for nonExistentPersonFaces fix`)

        if (allPhotoFaces.length > 0) {
          const personIds = [...new Set(allPhotoFaces.map((pf) => pf.person_id!))]

          const existingIds = new Set<string>()
          for (let i = 0; i < personIds.length; i += 500) {
            const batch = personIds.slice(i, i + 500)
            const { data: existingPeople } = await supabase.from("people").select("id").in("id", batch)
            existingPeople?.forEach((p: any) => existingIds.add(p.id))
          }

          const invalidIds = allPhotoFaces.filter((pf) => !existingIds.has(pf.person_id!)).map((pf) => pf.id)

          if (invalidIds.length > 0) {
            // Update батчами
            for (let i = 0; i < invalidIds.length; i += 500) {
              const batch = invalidIds.slice(i, i + 500)
              const { error: updateError } = await supabase
                .from("photo_faces")
                .update({ person_id: null, verified: false, recognition_confidence: null })
                .in("id", batch)

              if (updateError) throw updateError
            }
            fixed = invalidIds.length
            details.updatedIds = invalidIds.slice(0, 100)
          }
        }
        break
      }

      case "nonExistentPhotoFaces": {
        // С ПАГИНАЦИЕЙ
        const allPhotoFaces = await loadAllPhotoFaces<{ id: string; photo_id: string }>(
          supabase,
          "id, photo_id"
        )
        console.log(`[v2.1] Total photo_faces loaded: ${allPhotoFaces.length}`)

        if (allPhotoFaces.length > 0) {
          const photoIds = [...new Set(allPhotoFaces.map((pf) => pf.photo_id))]
          console.log(`[v2.1] Unique photo_ids: ${photoIds.length}`)

          const existingPhotoIds = new Set<string>()
          for (let i = 0; i < photoIds.length; i += 500) {
            const batch = photoIds.slice(i, i + 500)
            const { data: existingPhotos } = await supabase.from("gallery_images").select("id").in("id", batch)
            existingPhotos?.forEach((p: any) => existingPhotoIds.add(p.id))
          }

          console.log(`[v2.1] Existing photos found: ${existingPhotoIds.size}`)

          const invalidIds = allPhotoFaces.filter((pf) => !existingPhotoIds.has(pf.photo_id)).map((pf) => pf.id)

          console.log(`[v2.1] Invalid photo_faces to delete: ${invalidIds.length}`)

          if (invalidIds.length > 0) {
            const batchSize = 50
            let deleted = 0

            for (let i = 0; i < invalidIds.length; i += batchSize) {
              const batch = invalidIds.slice(i, i + batchSize)
              const { error: deleteError } = await supabase.from("photo_faces").delete().in("id", batch)

              if (deleteError) {
                console.error(`[v2.1] Error deleting batch ${i}-${i + batch.length}:`, deleteError)
              } else {
                deleted += batch.length
              }

              if (i + batchSize < invalidIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 100))
              }
            }

            fixed = deleted
            console.log(`[v2.1] Successfully deleted: ${deleted} records`)
          }
        }
        break
      }

      case "orphanedLinks": {
        const confidenceThreshold = await getConfidenceThreshold()

        // С ПАГИНАЦИЕЙ
        const allFaces = await loadAllPhotoFaces<{ id: string; recognition_confidence: number }>(
          supabase,
          "id, recognition_confidence",
          (q) => q.not("person_id", "is", null).not("insightface_descriptor", "is", null).eq("verified", false)
        )
        console.log(`[v2.1] Loaded ${allFaces.length} faces for orphanedLinks fix`)

        const toFix = allFaces.filter((f) => (f.recognition_confidence || 0) < confidenceThreshold)

        if (toFix.length > 0) {
          const idsToFix = toFix.map((f) => f.id)

          // Update батчами
          for (let i = 0; i < idsToFix.length; i += 500) {
            const batch = idsToFix.slice(i, i + 500)
            const { error } = await supabase
              .from("photo_faces")
              .update({ recognition_confidence: confidenceThreshold })
              .in("id", batch)

            if (error) throw error
          }

          fixed = idsToFix.length
          details.updatedIds = idsToFix.slice(0, 100)
        }
        break
      }

      case "unrecognizedFaces": {
        return {
          success: true,
          data: {
            fixed: 0,
            issueType,
            message: "Используйте 'Лица с несуществующим фото' для удаления этих записей",
          },
        }
      }

      case "duplicatePeople": {
        return {
          success: true,
          data: {
            fixed: 0,
            issueType,
            message: "Используйте диалог 'Просмотреть дубликаты' для ручного объединения или удаления",
          },
        }
      }

      default:
        return { success: false, error: `Unknown or unsupported issue type: ${issueType}` }
    }

    logger.info("actions/integrity", `Fixed ${fixed} issues of type ${issueType}`)
    console.log("[v2.1] Fixed issues count:", fixed)

    revalidatePath("/admin")

    return { success: true, data: { fixed, issueType, details } }
  } catch (error: any) {
    logger.error("actions/integrity", "Error fixing integrity issue", error)
    console.error("[v2.1] Error fixing integrity issue:", error)
    return { success: false, error: error.message || "Failed to fix integrity issue" }
  }
}

// Алиас для совместимости
export const fixIntegrityIssueAction = fixIntegrityIssuesAction
