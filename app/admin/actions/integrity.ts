"use server"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"

/**
 * Database Integrity Checker
 *
 * Полная проверка целостности базы данных системы распознавания лиц
 * 15 проверок + безопасные автофиксы
 */

export interface IntegrityReport {
  photoFaces: {
    verifiedWithoutPerson: number
    verifiedWithWrongConfidence: number
    personWithoutConfidence: number
    nonExistentPerson: number
    nonExistentPhoto: number
    inconsistentPersonId: number
  }
  faceDescriptors: {
    orphanedDescriptors: number
    nonExistentPerson: number
    withoutPerson: number
    withoutEmbedding: number
    duplicates: number
    inconsistentPersonId: number
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
      inconsistentPersonId: 0,
    }
    const faceDescriptors = {
      orphanedDescriptors: 0,
      nonExistentPerson: 0,
      withoutPerson: 0,
      withoutEmbedding: 0,
      duplicates: 0,
      inconsistentPersonId: 0,
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
        id, photo_id, person_id, verified, confidence, bbox,
        gallery_images!inner(id, url, gallery_id, galleries(title)),
        people(real_name)
      `)
      .eq("verified", true)
      .is("person_id", null)

    photoFaces.verifiedWithoutPerson = verifiedWithoutPerson?.length || 0
    console.log("[v0] verifiedWithoutPerson count:", photoFaces.verifiedWithoutPerson)
    if (verifiedWithoutPerson && verifiedWithoutPerson.length > 0) {
      details.verifiedWithoutPerson = verifiedWithoutPerson.slice(0, 10)
    }

    // 2. Verified с неправильным confidence
    const { data: verifiedWithWrongConfidence, error: e2 } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, confidence, bbox,
        gallery_images!inner(id, url, gallery_id, galleries(title))
      `)
      .eq("verified", true)
      .neq("confidence", 1.0)

    photoFaces.verifiedWithWrongConfidence = verifiedWithWrongConfidence?.length || 0
    console.log("[v0] verifiedWithWrongConfidence count:", photoFaces.verifiedWithWrongConfidence)
    if (verifiedWithWrongConfidence && verifiedWithWrongConfidence.length > 0) {
      details.verifiedWithWrongConfidence = verifiedWithWrongConfidence.slice(0, 10)
    }

    // 3. Person_id есть, но confidence=null
    const { data: personWithoutConfidence, error: e3 } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, person_id, bbox,
        people(real_name),
        gallery_images!inner(id, url, gallery_id, galleries(title))
      `)
      .not("person_id", "is", null)
      .is("confidence", null)

    photoFaces.personWithoutConfidence = personWithoutConfidence?.length || 0
    console.log("[v0] personWithoutConfidence count:", photoFaces.personWithoutConfidence)
    if (personWithoutConfidence && personWithoutConfidence.length > 0) {
      details.personWithoutConfidence = personWithoutConfidence.slice(0, 10)
    }

    // 4. Person_id не существует в people
    const { data: allPhotoFaces } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, person_id, bbox,
        gallery_images!inner(id, url, gallery_id, galleries(title))
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
        details.nonExistentPersonFaces = nonExistentPersonFaces.slice(0, 10)
      }
    }

    // 5. Photo_id не существует в gallery_images
    const { data: allPhotoFacesWithPhotos } = await supabase.from("photo_faces").select("id, photo_id, bbox")

    if (allPhotoFacesWithPhotos) {
      const photoIds = [...new Set(allPhotoFacesWithPhotos.map((pf) => pf.photo_id))]
      const { data: existingPhotos } = await supabase.from("gallery_images").select("id").in("id", photoIds)

      const existingPhotoIds = new Set(existingPhotos?.map((p) => p.id) || [])
      const nonExistentPhotoFaces = allPhotoFacesWithPhotos.filter((pf) => !existingPhotoIds.has(pf.photo_id))

      photoFaces.nonExistentPhoto = nonExistentPhotoFaces.length
      console.log("[v0] nonExistentPhoto count:", photoFaces.nonExistentPhoto)
      if (nonExistentPhotoFaces.length > 0) {
        details.nonExistentPhotoFaces = nonExistentPhotoFaces.slice(0, 10)
      }
    }

    // ========== FACE_DESCRIPTORS CHECKS ==========

    // 6. Orphaned descriptors (source_image_id не существует в photo_faces)
    const { data: allDescriptors } = await supabase.from("face_descriptors").select("id, source_image_id, person_id")

    if (allDescriptors) {
      const sourceImageIds = [...new Set(allDescriptors.map((fd) => fd.source_image_id))]
      const { data: existingPhotoFaces } = await supabase.from("photo_faces").select("id").in("id", sourceImageIds)

      const existingPhotoFaceIds = new Set(existingPhotoFaces?.map((pf) => pf.id) || [])
      const orphanedDescriptors = allDescriptors.filter((fd) => !existingPhotoFaceIds.has(fd.source_image_id))

      faceDescriptors.orphanedDescriptors = orphanedDescriptors.length
      console.log("[v0] orphanedDescriptors count:", faceDescriptors.orphanedDescriptors)

      if (orphanedDescriptors.length > 0) {
        const orphanedIds = orphanedDescriptors.slice(0, 100).map((d) => d.source_image_id)
        const { data: photoData } = await supabase
          .from("photo_faces")
          .select(`
            id, photo_id, bbox,
            gallery_images!inner(url, gallery_id, galleries(title)),
            people(real_name, telegram_username)
          `)
          .in("id", orphanedIds)

        details.orphanedDescriptors = orphanedDescriptors.slice(0, 100).map((fd) => {
          const photoFace = photoData?.find((pf) => pf.id === fd.source_image_id)
          return {
            id: fd.id,
            source_image_id: fd.source_image_id,
            person_id: fd.person_id,
            image_url: photoFace?.gallery_images?.url,
            bbox: photoFace?.bbox,
            gallery_title: photoFace?.gallery_images?.galleries?.title,
            person_name: photoFace?.people?.real_name,
            telegram_username: photoFace?.people?.telegram_username,
          }
        })
      }
    }

    // 7. Descriptors с несуществующим person_id
    if (allDescriptors) {
      const descriptorPersonIds = [...new Set(allDescriptors.filter((d) => d.person_id).map((d) => d.person_id!))]
      const { data: existingPeopleForDescriptors } = await supabase
        .from("people")
        .select("id")
        .in("id", descriptorPersonIds)

      const existingPeopleIds = new Set(existingPeopleForDescriptors?.map((p) => p.id) || [])
      const descriptorsWithNonExistentPerson = allDescriptors.filter(
        (d) => d.person_id && !existingPeopleIds.has(d.person_id),
      )

      faceDescriptors.nonExistentPerson = descriptorsWithNonExistentPerson.length
      console.log("[v0] descriptorsWithNonExistentPerson count:", faceDescriptors.nonExistentPerson)
      if (descriptorsWithNonExistentPerson.length > 0) {
        details.nonExistentPersonDescriptors = descriptorsWithNonExistentPerson.slice(0, 10)
      }
    }

    // 8. Descriptors без person_id
    const { data: descriptorsWithoutPerson, error: e8 } = await supabase
      .from("face_descriptors")
      .select("id, source_image_id")
      .is("person_id", null)

    faceDescriptors.withoutPerson = descriptorsWithoutPerson?.length || 0
    console.log("[v0] descriptorsWithoutPerson count:", faceDescriptors.withoutPerson)
    if (descriptorsWithoutPerson && descriptorsWithoutPerson.length > 0) {
      details.descriptorsWithoutPerson = descriptorsWithoutPerson.slice(0, 10)
    }

    // 9. Descriptors без embedding
    const { data: descriptorsWithoutEmbedding, error: e9 } = await supabase
      .from("face_descriptors")
      .select("id, source_image_id, person_id")
      .is("embedding", null)

    faceDescriptors.withoutEmbedding = descriptorsWithoutEmbedding?.length || 0
    console.log("[v0] descriptorsWithoutEmbedding count:", faceDescriptors.withoutEmbedding)
    if (descriptorsWithoutEmbedding && descriptorsWithoutEmbedding.length > 0) {
      details.descriptorsWithoutEmbedding = descriptorsWithoutEmbedding.slice(0, 10)
    }

    // 10. Duplicate descriptors (одинаковые person_id + source_image_id)
    if (allDescriptors) {
      const groupedDescriptors = new Map<string, any[]>()
      for (const descriptor of allDescriptors) {
        const key = `${descriptor.person_id}_${descriptor.source_image_id}`
        if (!groupedDescriptors.has(key)) {
          groupedDescriptors.set(key, [])
        }
        groupedDescriptors.get(key)!.push(descriptor)
      }

      const duplicateGroups = Array.from(groupedDescriptors.entries()).filter(
        ([_, descriptors]) => descriptors.length > 1,
      )
      const totalDuplicates = duplicateGroups.reduce((sum, [_, descriptors]) => sum + (descriptors.length - 1), 0)

      faceDescriptors.duplicates = totalDuplicates
      console.log("[v0] duplicates count:", faceDescriptors.duplicates)
      if (duplicateGroups.length > 0) {
        details.duplicateDescriptors = duplicateGroups.slice(0, 10).map(([key, descriptors]) => ({
          key,
          count: descriptors.length,
          ids: descriptors.map((d) => d.id),
        }))
      }
    }

    // ========== PEOPLE CHECKS ==========

    // 11. People без descriptors (информационное)
    const { data: allPeople } = await supabase.from("people").select(`
      id, 
      real_name, 
      telegram_username
    `)

    if (allPeople) {
      // Get actual descriptor counts from database
      const { data: descriptorCounts } = await supabase
        .from("face_descriptors")
        .select("person_id")
        .not("person_id", "is", null)

      const peopleWithDescriptorIds = new Set(descriptorCounts?.map((d) => d.person_id) || [])
      const peopleWithoutDescriptors = allPeople.filter((p) => !peopleWithDescriptorIds.has(p.id))

      people.withoutDescriptors = peopleWithoutDescriptors.length
      console.log("[v0] peopleWithoutDescriptors count:", people.withoutDescriptors)
      if (peopleWithoutDescriptors.length > 0) {
        details.peopleWithoutDescriptors = peopleWithoutDescriptors.slice(0, 10)
      }
    }

    // 12. People без faces (информационное)
    if (allPeople && allPhotoFaces) {
      const peopleWithFaces = new Set(allPhotoFaces.filter((pf) => pf.person_id).map((pf) => pf.person_id))
      const peopleWithoutFaces = allPeople.filter((p) => !peopleWithFaces.has(p.id))

      people.withoutFaces = peopleWithoutFaces.length
      console.log("[v0] peopleWithoutFaces count:", people.withoutFaces)
      if (peopleWithoutFaces.length > 0) {
        details.peopleWithoutFaces = peopleWithoutFaces.slice(0, 10)
      }
    }

    // 13. Duplicate names (информационное)
    if (allPeople) {
      // Group by real_name AND telegram_username (if both are same - true duplicate)
      const nameGroups = new Map<string, any[]>()
      for (const person of allPeople) {
        if (!person.real_name) continue
        // Key includes both name and telegram to distinguish different people
        const key = `${person.real_name.toLowerCase()}_${person.telegram_username || "notelegram"}`
        if (!nameGroups.has(key)) {
          nameGroups.set(key, [])
        }
        nameGroups.get(key)!.push(person)
      }

      // Only count REAL duplicates (same name AND same telegram)
      const duplicateNames = Array.from(nameGroups.entries()).filter(([_, people]) => people.length > 1)

      // Count total number of duplicate records
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
      faceDescriptors.orphanedDescriptors +
      faceDescriptors.nonExistentPerson +
      faceDescriptors.withoutPerson +
      faceDescriptors.withoutEmbedding +
      faceDescriptors.duplicates

    const report: IntegrityReport = {
      photoFaces,
      faceDescriptors,
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
      // БЕЗОПАСНЫЕ АВТОФИКСЫ

      case "orphanedDescriptors": {
        // Удалить дескрипторы без photo_faces
        const { data: allDescriptors } = await supabase.from("face_descriptors").select("id, source_image_id")

        if (allDescriptors) {
          const sourceImageIds = [...new Set(allDescriptors.map((fd) => fd.source_image_id))]
          const { data: existingPhotoFaces } = await supabase.from("photo_faces").select("id").in("id", sourceImageIds)

          const existingPhotoFaceIds = new Set(existingPhotoFaces?.map((pf) => pf.id) || [])
          const orphanedIds = allDescriptors
            .filter((fd) => !existingPhotoFaceIds.has(fd.source_image_id))
            .map((fd) => fd.id)

          if (orphanedIds.length > 0) {
            const { error: deleteError } = await supabase.from("face_descriptors").delete().in("id", orphanedIds)

            if (deleteError) throw deleteError
            fixed = orphanedIds.length
            details.deletedIds = orphanedIds
          }
        }
        break
      }

      case "verifiedWithoutPerson": {
        // Снять verified у лиц без person_id
        const { data: updated, error } = await supabase
          .from("photo_faces")
          .update({ verified: false, confidence: null })
          .eq("verified", true)
          .is("person_id", null)
          .select("id")

        if (error) throw error
        fixed = updated?.length || 0
        details.updatedIds = updated?.map((u) => u.id)
        break
      }

      case "verifiedWithWrongConfidence": {
        // Исправить confidence для verified=true
        const { data: updated, error } = await supabase
          .from("photo_faces")
          .update({ confidence: 1.0 })
          .eq("verified", true)
          .neq("confidence", 1.0)
          .select("id")

        if (error) throw error
        fixed = updated?.length || 0
        details.updatedIds = updated?.map((u) => u.id)
        break
      }

      case "nonExistentPerson": {
        // Убрать person_id для удаленных людей
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
              .update({ person_id: null, verified: false, confidence: null })
              .in("id", invalidIds)

            if (updateError) throw updateError
            fixed = invalidIds.length
            details.updatedIds = invalidIds
          }
        }
        break
      }

      case "nonExistentPhoto": {
        // Удалить лица с несуществующих фото
        const { data: allPhotoFaces } = await supabase.from("photo_faces").select("id, photo_id")

        if (allPhotoFaces) {
          const photoIds = [...new Set(allPhotoFaces.map((pf) => pf.photo_id))]
          const { data: existingPhotos } = await supabase.from("gallery_images").select("id").in("id", photoIds)

          const existingPhotoIds = new Set(existingPhotos?.map((p) => p.id) || [])
          const invalidIds = allPhotoFaces.filter((pf) => !existingPhotoIds.has(pf.photo_id)).map((pf) => pf.id)

          if (invalidIds.length > 0) {
            const { error: deleteError } = await supabase.from("photo_faces").delete().in("id", invalidIds)

            if (deleteError) throw deleteError
            fixed = invalidIds.length
            details.deletedIds = invalidIds
          }
        }
        break
      }

      case "duplicateDescriptors": {
        // Удалить дубликаты дескрипторов (оставить самый новый)
        const { data: allDescriptors } = await supabase
          .from("face_descriptors")
          .select("id, source_image_id, person_id, created_at")
          .order("created_at", { ascending: false })

        if (allDescriptors) {
          const groupedDescriptors = new Map<string, any[]>()
          for (const descriptor of allDescriptors) {
            const key = `${descriptor.person_id}_${descriptor.source_image_id}`
            if (!groupedDescriptors.has(key)) {
              groupedDescriptors.set(key, [])
            }
            groupedDescriptors.get(key)!.push(descriptor)
          }

          const idsToDelete: string[] = []
          for (const [_, descriptors] of groupedDescriptors.entries()) {
            if (descriptors.length > 1) {
              // Оставить первый (самый новый), удалить остальные
              idsToDelete.push(...descriptors.slice(1).map((d) => d.id))
            }
          }

          if (idsToDelete.length > 0) {
            const { error: deleteError } = await supabase.from("face_descriptors").delete().in("id", idsToDelete)

            if (deleteError) throw deleteError
            fixed = idsToDelete.length
            details.deletedIds = idsToDelete
          }
        }
        break
      }

      case "descriptorsWithoutEmbedding": {
        // Удалить дескрипторы без embedding
        const { data: deleted, error } = await supabase
          .from("face_descriptors")
          .delete()
          .is("embedding", null)
          .select("id")

        if (error) throw error
        fixed = deleted?.length || 0
        details.deletedIds = deleted?.map((d) => d.id)
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
      case "orphanedDescriptors": {
        const { data: allDescriptors } = await supabase
          .from("face_descriptors")
          .select("id, source_image_id, person_id, created_at")
          .limit(1000)

        if (allDescriptors) {
          const sourceImageIds = [...new Set(allDescriptors.map((fd) => fd.source_image_id))]
          const { data: existingPhotoFaces } = await supabase
            .from("photo_faces")
            .select(`
              id, photo_id, bbox,
              gallery_images!inner(url, gallery_id, galleries(title))
            `)
            .in("id", sourceImageIds)

          const existingPhotoFaceIds = new Set(existingPhotoFaces?.map((pf) => pf.id) || [])
          // Enrich orphaned descriptors with photo data
          details = allDescriptors
            .filter((fd) => !existingPhotoFaceIds.has(fd.source_image_id))
            .map((fd) => {
              const photoFace = existingPhotoFaces?.find((pf) => pf.id === fd.source_image_id)
              return { ...fd, photoFace }
            })
            .slice(0, limit)
        }
        break
      }

      case "peopleWithoutDescriptors": {
        const { data: allPeople } = await supabase.from("people").select("id, real_name, telegram_username")

        const { data: allDescriptors } = await supabase.from("face_descriptors").select("person_id")

        if (allPeople && allDescriptors) {
          const peopleWithDescriptorIds = new Set(allDescriptors.filter((d) => d.person_id).map((d) => d.person_id))
          details = allPeople.filter((p) => !peopleWithDescriptorIds.has(p.id)).slice(0, limit)
        }
        break
      }

      case "peopleWithoutFaces": {
        const { data: allPeople } = await supabase.from("people").select("id, real_name, telegram_username")

        const { data: allPhotoFaces } = await supabase.from("photo_faces").select("person_id")

        if (allPeople && allPhotoFaces) {
          const peopleWithFaces = new Set(allPhotoFaces.filter((pf) => pf.person_id).map((pf) => pf.person_id))
          details = allPeople.filter((p) => !peopleWithFaces.has(p.id)).slice(0, limit)
        }
        break
      }

      case "duplicateNames": {
        const { data: allPeople } = await supabase.from("people").select("id, real_name, telegram_username")

        if (allPeople) {
          const nameGroups = new Map<string, any[]>()
          for (const person of allPeople) {
            if (!person.real_name) continue
            // Key includes both name and telegram to distinguish different people
            const key = `${person.real_name.toLowerCase()}_${person.telegram_username || "notelegram"}`
            if (!nameGroups.has(key)) {
              nameGroups.set(key, [])
            }
            nameGroups.get(key)!.push(person)
          }

          details = Array.from(nameGroups.entries())
            .filter(([_, people]) => people.length > 1)
            .slice(0, limit)
            .flatMap(([key, people]) =>
              people.map((p: any) => ({
                ...p,
                duplicate_key: key,
                duplicate_count: people.length,
              })),
            )
        }
        break
      }

      default:
        return { success: false, error: `Unknown issue type: ${issueType}` }
    }

    return { success: true, data: details }
  } catch (error: any) {
    logger.error("actions/integrity", "Error getting issue details", error)
    console.error("[v0] Error getting issue details:", error)
    return { success: false, error: error.message || "Failed to get issue details" }
  }
}

export const checkDatabaseIntegrityAction = checkDatabaseIntegrityFullAction
export const fixIntegrityIssueAction = fixIntegrityIssuesAction
