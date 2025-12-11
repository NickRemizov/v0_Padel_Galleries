"use server"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"

/**
 * Database Integrity Checker
 * Исправлены имена полей + orphanedLinks + actions для карточек
 */

export interface IntegrityReport {
  photoFaces: {
    verifiedWithoutPerson: number
    verifiedWithWrongConfidence: number
    personWithoutConfidence: number
    nonExistentPerson: number
    nonExistentPhoto: number
    orphanedLinks: number
  }
  people: {
    withoutDescriptors: number
    withoutFaces: number
    duplicateNames: number
  }
  totalIssues: number
  details: Record<string, any[]>
}

/**
 * Получить порог confidence из настроек
 */
async function getConfidenceThreshold(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("face_recognition_config")
      .select("value")
      .eq("key", "recognition_settings")
      .single()

    if (data?.value?.confidence_thresholds?.high_data) {
      return data.value.confidence_thresholds.high_data
    }
  } catch (error) {
    console.error("[integrity] Failed to get config:", error)
  }
  return 0.6 // fallback
}

/**
 * Полная проверка целостности базы данных
 */
export async function checkDatabaseIntegrityFullAction(): Promise<{
  success: boolean
  data?: IntegrityReport
  error?: string
}> {
  console.log("[v0] Starting integrity check...")
  const supabase = await createClient()

  try {
    logger.debug("actions/integrity", "Starting FULL database integrity check...")

    const photoFaces = {
      verifiedWithoutPerson: 0,
      verifiedWithWrongConfidence: 0,
      personWithoutConfidence: 0,
      nonExistentPerson: 0,
      nonExistentPhoto: 0,
      orphanedLinks: 0,
    }
    const people = {
      withoutDescriptors: 0,
      withoutFaces: 0,
      duplicateNames: 0,
    }
    let totalIssues = 0
    const details: any = {}

    // ========== PHOTO_FACES CHECKS ==========

    // 1. Verified без person_id
    const { data: verifiedWithoutPerson, error: e1 } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, person_id, verified, recognition_confidence, insightface_bbox,
        gallery_images!inner(id, image_url, original_filename, gallery_id, galleries(title, shoot_date)),
        people(real_name)
      `)
      .eq("verified", true)
      .is("person_id", null)

    photoFaces.verifiedWithoutPerson = verifiedWithoutPerson?.length || 0
    console.log("[v0] verifiedWithoutPerson count:", photoFaces.verifiedWithoutPerson)
    if (verifiedWithoutPerson && verifiedWithoutPerson.length > 0) {
      details.verifiedWithoutPerson = verifiedWithoutPerson.slice(0, 50).map((item: any) => ({
        id: item.id,
        photo_id: item.photo_id,
        person_id: item.person_id,
        confidence: item.recognition_confidence,
        bbox: item.insightface_bbox,
        image_url: item.gallery_images?.image_url,
        gallery_title: item.gallery_images?.galleries?.title,
        shoot_date: item.gallery_images?.galleries?.shoot_date,
        filename: item.gallery_images?.original_filename,
      }))
    }

    // 2. Verified с неправильным confidence
    const { data: verifiedWithWrongConfidence, error: e2 } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, recognition_confidence, insightface_bbox,
        gallery_images!inner(id, image_url, gallery_id, galleries(title))
      `)
      .eq("verified", true)
      .neq("recognition_confidence", 1.0)

    photoFaces.verifiedWithWrongConfidence = verifiedWithWrongConfidence?.length || 0
    console.log("[v0] verifiedWithWrongConfidence count:", photoFaces.verifiedWithWrongConfidence)
    if (verifiedWithWrongConfidence && verifiedWithWrongConfidence.length > 0) {
      details.verifiedWithWrongConfidence = verifiedWithWrongConfidence.slice(0, 10).map((item: any) => ({
        ...item,
        confidence: item.recognition_confidence,
        bbox: item.insightface_bbox,
        image_url: item.gallery_images?.image_url,
        gallery_title: item.gallery_images?.galleries?.title,
      }))
    }

    // 3. Person_id есть, но confidence=null
    const { data: personWithoutConfidence, error: e3 } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, person_id, insightface_bbox,
        people(real_name),
        gallery_images!inner(id, image_url, gallery_id, galleries(title))
      `)
      .not("person_id", "is", null)
      .is("recognition_confidence", null)

    photoFaces.personWithoutConfidence = personWithoutConfidence?.length || 0
    console.log("[v0] personWithoutConfidence count:", photoFaces.personWithoutConfidence)
    if (personWithoutConfidence && personWithoutConfidence.length > 0) {
      details.personWithoutConfidence = personWithoutConfidence.slice(0, 10).map((item: any) => ({
        ...item,
        bbox: item.insightface_bbox,
        image_url: item.gallery_images?.image_url,
        gallery_title: item.gallery_images?.galleries?.title,
        person_name: item.people?.real_name,
      }))
    }

    // 4. Person_id не существует в people
    const { data: allPhotoFaces } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, person_id, insightface_bbox,
        gallery_images!inner(id, image_url, gallery_id, galleries(title))
      `)
      .not("person_id", "is", null)

    if (allPhotoFaces) {
      const personIds = [...new Set(allPhotoFaces.map((pf) => pf.person_id))]
      const { data: existingPeople } = await supabase.from("people").select("id").in("id", personIds)

      const existingIds = new Set(existingPeople?.map((p) => p.id) || [])
      const nonExistentPersonFaces = allPhotoFaces.filter((pf) => !existingIds.has(pf.person_id!))

      photoFaces.nonExistentPerson = nonExistentPersonFaces.length
      console.log("[v0] nonExistentPerson count:", photoFaces.nonExistentPerson)
      if (nonExistentPersonFaces.length > 0) {
        details.nonExistentPersonFaces = nonExistentPersonFaces.slice(0, 10).map((item: any) => ({
          ...item,
          bbox: item.insightface_bbox,
          image_url: item.gallery_images?.image_url,
          gallery_title: item.gallery_images?.galleries?.title,
        }))
      }
    }

    // 5. Photo_id не существует в gallery_images
    const { data: allPhotoFacesWithPhotos } = await supabase
      .from("photo_faces")
      .select("id, photo_id, insightface_bbox")

    if (allPhotoFacesWithPhotos) {
      const photoIds = [...new Set(allPhotoFacesWithPhotos.map((pf) => pf.photo_id))]
      const { data: existingPhotos } = await supabase.from("gallery_images").select("id").in("id", photoIds)

      const existingPhotoIds = new Set(existingPhotos?.map((p) => p.id) || [])
      const nonExistentPhotoFaces = allPhotoFacesWithPhotos.filter((pf) => !existingPhotoIds.has(pf.photo_id))

      photoFaces.nonExistentPhoto = nonExistentPhotoFaces.length
      console.log("[v0] nonExistentPhoto count:", photoFaces.nonExistentPhoto)
      if (nonExistentPhotoFaces.length > 0) {
        details.nonExistentPhotoFaces = nonExistentPhotoFaces.slice(0, 10).map((item: any) => ({
          ...item,
          bbox: item.insightface_bbox,
        }))
      }
    }

    // 6. Orphaned links - faces with person_id but not visible (below threshold and not verified)
    const confidenceThreshold = await getConfidenceThreshold() // Updated to use getConfidenceThreshold
    console.log(`[v0] Using confidence threshold: ${confidenceThreshold}`)
    const { data: allFacesForOrphaned } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, person_id, verified, recognition_confidence, insightface_bbox, insightface_descriptor,
        gallery_images!inner(id, image_url, original_filename, gallery_id, galleries(title, shoot_date)),
        people(real_name)
      `)
      .not("person_id", "is", null)
      .not("insightface_descriptor", "is", null)
      .eq("verified", false)

    // Filter by confidence < threshold (these are "lost" - have person but not visible)
    const orphanedLinks = (allFacesForOrphaned || []).filter(
      (face) => (face.recognition_confidence || 0) < confidenceThreshold,
    )

    photoFaces.orphanedLinks = orphanedLinks.length
    console.log("[v0] orphanedLinks count:", photoFaces.orphanedLinks)
    if (orphanedLinks.length > 0) {
      details.orphanedLinks = orphanedLinks.slice(0, 50).map((face: any) => ({
        id: face.id,
        photo_id: face.photo_id,
        person_id: face.person_id,
        person_name: face.people?.real_name || "Unknown",
        confidence: face.recognition_confidence,
        verified: face.verified,
        image_url: face.gallery_images?.image_url,
        bbox: face.insightface_bbox,
        gallery_title: face.gallery_images?.galleries?.title,
        shoot_date: face.gallery_images?.galleries?.shoot_date,
        filename: face.gallery_images?.original_filename,
      }))
    }

    // ========== PEOPLE CHECKS ==========

    // 7. People без descriptors в photo_faces.insightface_descriptor
    const { data: allPeople } = await supabase.from("people").select(`
      id, 
      real_name, 
      telegram_username
    `)

    if (allPeople) {
      const { data: facesWithDescriptors } = await supabase
        .from("photo_faces")
        .select("person_id")
        .not("person_id", "is", null)
        .not("insightface_descriptor", "is", null)

      const peopleWithDescriptorIds = new Set(facesWithDescriptors?.map((f) => f.person_id) || [])
      const peopleWithoutDescriptors = allPeople.filter((p) => !peopleWithDescriptorIds.has(p.id))

      people.withoutDescriptors = peopleWithoutDescriptors.length
      console.log("[v0] peopleWithoutDescriptors count:", people.withoutDescriptors)
      if (peopleWithoutDescriptors.length > 0) {
        details.peopleWithoutDescriptors = peopleWithoutDescriptors.slice(0, 10)
      }
    }

    // 8. People без faces (информационное)
    if (allPeople && allPhotoFaces) {
      const peopleWithFaces = new Set(allPhotoFaces.filter((pf) => pf.person_id).map((pf) => pf.person_id))
      const peopleWithoutFaces = allPeople.filter((p) => !peopleWithFaces.has(p.id))

      people.withoutFaces = peopleWithoutFaces.length
      console.log("[v0] peopleWithoutFaces count:", people.withoutFaces)
      if (peopleWithoutFaces.length > 0) {
        details.peopleWithoutFaces = peopleWithoutFaces.slice(0, 10)
      }
    }

    // 9. Duplicate names (информационное)
    if (allPeople) {
      const nameGroups = new Map<string, any[]>()
      for (const person of allPeople) {
        if (!person.real_name) continue
        const key = `${person.real_name.toLowerCase()}_${person.telegram_username || "notelegram"}`
        if (!nameGroups.has(key)) {
          nameGroups.set(key, [])
        }
        nameGroups.get(key)!.push(person)
      }

      const duplicateNames = Array.from(nameGroups.entries()).filter(([_, people]) => people.length > 1)

      people.duplicateNames = duplicateNames.length
      console.log("[v0] duplicateNames groups:", people.duplicateNames)

      if (duplicateNames.length > 0) {
        details.duplicateNames = duplicateNames.slice(0, 10).flatMap(([key, people]) =>
          people.map((p: any) => ({
            ...p,
            duplicate_key: key,
            duplicate_count: people.length,
          })),
        )
      }
    }

    // ========== CALCULATE TOTAL ==========

    totalIssues =
      photoFaces.verifiedWithoutPerson +
      photoFaces.verifiedWithWrongConfidence +
      photoFaces.personWithoutConfidence +
      photoFaces.nonExistentPerson +
      photoFaces.nonExistentPhoto +
      photoFaces.orphanedLinks

    const report: IntegrityReport = {
      photoFaces,
      people,
      totalIssues,
      details,
    }

    console.log("[v0] Integrity check complete. Total issues:", totalIssues)
    console.log("[v0] Returning report:", JSON.stringify(report, null, 2))

    return { success: true, data: report }
  } catch (error: any) {
    console.log("[v0] Error in integrity check:", error.message)
    logger.error("actions/integrity", "Error checking database integrity", error)
    return { success: false, error: error.message || "Failed to check database integrity" }
  }
}

/**
 * Автоматическое исправление проблем целостности
 * Только БЕЗОПАСНЫЕ операции
 */
export async function fixIntegrityIssuesAction(
  issueType: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
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
        details.updatedIds = updated?.map((u) => u.id)
        break
      }

      case "verifiedWithWrongConfidence": {
        const { data: updated, error } = await supabase
          .from("photo_faces")
          .update({ recognition_confidence: 1.0 })
          .eq("verified", true)
          .neq("recognition_confidence", 1.0)
          .select("id")

        if (error) throw error
        fixed = updated?.length || 0
        details.updatedIds = updated?.map((u) => u.id)
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
        details.updatedIds = updated?.map((u) => u.id)
        break
      }

      case "nonExistentPersonFaces": {
        const { data: allPhotoFaces } = await supabase
          .from("photo_faces")
          .select("id, person_id")
          .not("person_id", "is", null)

        if (allPhotoFaces) {
          const personIds = [...new Set(allPhotoFaces.map((pf) => pf.person_id!))]
          const { data: existingPeople } = await supabase.from("people").select("id").in("id", personIds)

          const existingIds = new Set(existingPeople?.map((p) => p.id) || [])
          const invalidIds = allPhotoFaces.filter((pf) => !existingIds.has(pf.person_id!)).map((pf) => pf.id)

          if (invalidIds.length > 0) {
            const { error: updateError } = await supabase
              .from("photo_faces")
              .update({ person_id: null, verified: false, recognition_confidence: null })
              .in("id", invalidIds)

            if (updateError) throw updateError
            fixed = invalidIds.length
            details.updatedIds = invalidIds
          }
        }
        break
      }

      case "nonExistentPhotoFaces": {
        // Получаем ВСЕ photo_faces с пагинацией (Supabase лимит 1000)
        let allPhotoFaces: { id: string; photo_id: string }[] = []
        let offset = 0
        const pageSize = 1000

        while (true) {
          const { data: batch } = await supabase
            .from("photo_faces")
            .select("id, photo_id")
            .range(offset, offset + pageSize - 1)

          if (!batch || batch.length === 0) break
          allPhotoFaces = allPhotoFaces.concat(batch)
          if (batch.length < pageSize) break
          offset += pageSize
        }

        console.log(`[v0] Total photo_faces loaded: ${allPhotoFaces.length}`)

        if (allPhotoFaces.length > 0) {
          // Получаем уникальные photo_id
          const photoIds = [...new Set(allPhotoFaces.map((pf) => pf.photo_id))]
          console.log(`[v0] Unique photo_ids: ${photoIds.length}`)

          // Проверяем существующие фото батчами
          const existingPhotoIds = new Set<string>()
          for (let i = 0; i < photoIds.length; i += 500) {
            const batch = photoIds.slice(i, i + 500)
            const { data: existingPhotos } = await supabase.from("gallery_images").select("id").in("id", batch)

            existingPhotos?.forEach((p) => existingPhotoIds.add(p.id))
          }

          console.log(`[v0] Existing photos found: ${existingPhotoIds.size}`)

          // Находим ID записей с несуществующими фото
          const invalidIds = allPhotoFaces.filter((pf) => !existingPhotoIds.has(pf.photo_id)).map((pf) => pf.id)

          console.log(`[v0] Invalid photo_faces to delete: ${invalidIds.length}`)

          if (invalidIds.length > 0) {
            // Удаляем батчами по 50 записей
            const batchSize = 50
            let deleted = 0

            for (let i = 0; i < invalidIds.length; i += batchSize) {
              const batch = invalidIds.slice(i, i + batchSize)
              const { error: deleteError } = await supabase.from("photo_faces").delete().in("id", batch)

              if (deleteError) {
                console.error(`[v0] Error deleting batch ${i}-${i + batch.length}:`, deleteError)
                // Продолжаем удаление остальных батчей
              } else {
                deleted += batch.length
              }

              // Небольшая пауза между батчами
              if (i + batchSize < invalidIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 100))
              }
            }

            fixed = deleted
            console.log(`[v0] Successfully deleted: ${deleted} records`)
          }
        }
        break
      }

      case "orphanedLinks": {
        // Elevate confidence to threshold to make faces visible
        const confidenceThreshold = await getConfidenceThreshold() // Updated to use getConfidenceThreshold

        const { data: allFaces } = await supabase
          .from("photo_faces")
          .select("id, recognition_confidence")
          .not("person_id", "is", null)
          .not("insightface_descriptor", "is", null)
          .eq("verified", false)

        const toFix = (allFaces || []).filter((f) => (f.recognition_confidence || 0) < confidenceThreshold)

        if (toFix.length > 0) {
          const idsToFix = toFix.map((f) => f.id)
          const { error } = await supabase
            .from("photo_faces")
            .update({ recognition_confidence: confidenceThreshold })
            .in("id", idsToFix)

          if (error) throw error
          fixed = idsToFix.length
          details.updatedIds = idsToFix
        }
        break
      }

      default:
        return { success: false, error: `Unknown or unsupported issue type: ${issueType}` }
    }

    logger.info("actions/integrity", `Fixed ${fixed} issues of type ${issueType}`)
    console.log("[v0] Fixed issues count:", fixed)

    revalidatePath("/admin")

    return { success: true, data: { fixed, issueType, details } }
  } catch (error: any) {
    logger.error("actions/integrity", "Error fixing integrity issue", error)
    console.error("[v0] Error fixing integrity issue:", error)
    return { success: false, error: error.message || "Failed to fix integrity issue" }
  }
}

/**
 * Получить детальную информацию о конкретной проблеме
 */
export async function getIssueDetailsAction(
  issueType: string,
  limit = 50,
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  const supabase = await createClient()

  try {
    let details: any[] = []

    switch (issueType) {
      case "verifiedWithoutPerson": {
        const { data } = await supabase
          .from("photo_faces")
          .select(`
            id, photo_id, insightface_bbox,
            gallery_images!inner(image_url, gallery_id, galleries(title))
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

      case "orphanedLinks": {
        const confidenceThreshold = await getConfidenceThreshold() // Updated to use getConfidenceThreshold
        const { data } = await supabase
          .from("photo_faces")
          .select(`
            id, photo_id, person_id, verified, recognition_confidence, insightface_bbox,
            gallery_images!inner(id, image_url, galleries(title)),
            people(real_name)
          `)
          .not("person_id", "is", null)
          .not("insightface_descriptor", "is", null)
          .eq("verified", false)
          .limit(200)

        details = (data || [])
          .filter((f) => (f.recognition_confidence || 0) < confidenceThreshold)
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
  threshold?: number,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    if (actionType === "verify") {
      // verify - установить verified=true и confidence=1.0
      const { error } = await supabase
        .from("photo_faces")
        .update({ verified: true, recognition_confidence: 1.0 })
        .eq("id", faceId)

      if (error) throw error
    } else {
      // elevate - установить confidence до порога
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
  actionType: "unverify" | "unlink",
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

export const checkDatabaseIntegrityAction = checkDatabaseIntegrityFullAction
export const fixIntegrityIssueAction = fixIntegrityIssuesAction
