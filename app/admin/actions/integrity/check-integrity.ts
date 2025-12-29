"use server"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { IntegrityReport, IntegrityActionResult } from "./types"
import { CONFIDENCE_100_THRESHOLD, DUPLICATE_CHECK_FIELDS } from "./constants"
import { getConfidenceThreshold, loadAllPhotoFaces } from "./utils"

/**
 * Database Integrity Checker
 * v2.1: Changed CONFIDENCE_100_THRESHOLD from 0.9999 to 0.99
 * + added pagination to confidenceWithoutVerified check
 * + пагинация для всех запросов к photo_faces
 * + правильная проверка дубликатов по 5 полям
 */
export async function checkDatabaseIntegrityFullAction(): Promise<IntegrityActionResult<IntegrityReport>> {
  console.log("[v2.1] Starting integrity check...")
  const supabase = await createClient()

  try {
    logger.debug("actions/integrity", "Starting FULL database integrity check...")

    const [
      { count: totalGalleries },
      { count: totalPhotos },
      { count: totalPhotoFaces },
      { count: totalPeople },
      { count: totalConfigs },
      { count: totalEventPlayers },
      { count: totalTelegramBots },
    ] = await Promise.all([
      supabase.from("galleries").select("*", { count: "exact", head: true }),
      supabase.from("gallery_images").select("*", { count: "exact", head: true }),
      supabase.from("photo_faces").select("*", { count: "exact", head: true }),
      supabase.from("people").select("*", { count: "exact", head: true }),
      supabase.from("face_recognition_config").select("*", { count: "exact", head: true }),
      supabase.from("event_players").select("*", { count: "exact", head: true }),
      supabase.from("telegram_bots").select("*", { count: "exact", head: true }),
    ])

    const stats = {
      totalGalleries: totalGalleries || 0,
      totalPhotos: totalPhotos || 0,
      totalPhotoFaces: totalPhotoFaces || 0,
      totalPeople: totalPeople || 0,
      totalConfigs: totalConfigs || 0,
      totalEventPlayers: totalEventPlayers || 0,
      totalTelegramBots: totalTelegramBots || 0,
    }

    const photoFaces = {
      verifiedWithoutPerson: 0,
      verifiedWithWrongConfidence: 0,
      confidenceWithoutVerified: 0,
      personWithoutConfidence: 0,
      nonExistentPerson: 0,
      nonExistentPhoto: 0,
      orphanedLinks: 0,
      unrecognizedFaces: 0,
    }
    const people = {
      withoutFaces: 0,
      duplicatePeople: 0,
    }
    let totalIssues = 0
    const details: any = {}

    // ========== PHOTO_FACES CHECKS ==========

    // 1. Verified без person_id (обычно немного записей, пагинация не критична)
    const { data: verifiedWithoutPerson } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, person_id, verified, recognition_confidence, insightface_bbox,
        gallery_images(id, image_url, original_filename, gallery_id, galleries(title, shoot_date)),
        people(real_name)
      `)
      .eq("verified", true)
      .is("person_id", null)

    photoFaces.verifiedWithoutPerson = verifiedWithoutPerson?.length || 0
    console.log("[v2.1] verifiedWithoutPerson count:", photoFaces.verifiedWithoutPerson)
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

    // 2. Verified с неправильным confidence (< 0.99)
    const { data: verifiedWithWrongConfidence } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, recognition_confidence, insightface_bbox,
        gallery_images(id, image_url, gallery_id, galleries(title))
      `)
      .eq("verified", true)
      .lt("recognition_confidence", CONFIDENCE_100_THRESHOLD)

    photoFaces.verifiedWithWrongConfidence = verifiedWithWrongConfidence?.length || 0
    console.log("[v2.1] verifiedWithWrongConfidence count:", photoFaces.verifiedWithWrongConfidence)
    if (verifiedWithWrongConfidence && verifiedWithWrongConfidence.length > 0) {
      details.verifiedWithWrongConfidence = verifiedWithWrongConfidence.slice(0, 50).map((item: any) => ({
        ...item,
        confidence: item.recognition_confidence,
        bbox: item.insightface_bbox,
        image_url: item.gallery_images?.image_url,
        gallery_title: item.gallery_images?.galleries?.title,
      }))
    }

    // 2b. Confidence ~100% без verified (С ПАГИНАЦИЕЙ)
    // v2.1: Now using pagination to catch all records
    const allConfidenceWithoutVerified = await loadAllPhotoFaces<any>(
      supabase,
      `id, photo_id, person_id, recognition_confidence, verified, insightface_bbox,
       gallery_images(id, image_url, gallery_id, galleries(title)),
       people(real_name)`,
      (q) => q.gte("recognition_confidence", CONFIDENCE_100_THRESHOLD).eq("verified", false)
    )
    console.log(`[v2.1] confidenceWithoutVerified loaded with pagination: ${allConfidenceWithoutVerified.length}`)

    photoFaces.confidenceWithoutVerified = allConfidenceWithoutVerified.length
    if (allConfidenceWithoutVerified.length > 0) {
      details.confidenceWithoutVerified = allConfidenceWithoutVerified.slice(0, 50).map((item: any) => ({
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
    }

    // 3. Person_id есть, но confidence=null (обычно немного записей)
    const { data: personWithoutConfidence } = await supabase
      .from("photo_faces")
      .select(`
        id, photo_id, person_id, insightface_bbox,
        people(real_name),
        gallery_images(id, image_url, gallery_id, galleries(title))
      `)
      .not("person_id", "is", null)
      .is("recognition_confidence", null)

    photoFaces.personWithoutConfidence = personWithoutConfidence?.length || 0
    console.log("[v2.1] personWithoutConfidence count:", photoFaces.personWithoutConfidence)
    if (personWithoutConfidence && personWithoutConfidence.length > 0) {
      details.personWithoutConfidence = personWithoutConfidence.slice(0, 10).map((item: any) => ({
        ...item,
        bbox: item.insightface_bbox,
        image_url: item.gallery_images?.image_url,
        gallery_title: item.gallery_images?.galleries?.title,
        person_name: item.people?.real_name,
      }))
    }

    // 4. Person_id не существует в people (С ПАГИНАЦИЕЙ)
    const allPhotoFacesWithPerson = await loadAllPhotoFaces<any>(
      supabase,
      "id, photo_id, person_id, insightface_bbox",
      (q) => q.not("person_id", "is", null)
    )
    console.log(`[v2.1] Total photo_faces with person_id loaded: ${allPhotoFacesWithPerson.length}`)

    if (allPhotoFacesWithPerson.length > 0) {
      const personIds = [...new Set(allPhotoFacesWithPerson.map((pf) => pf.person_id))]

      // Проверяем существующих людей батчами
      const existingIds = new Set<string>()
      for (let i = 0; i < personIds.length; i += 500) {
        const batch = personIds.slice(i, i + 500)
        const { data: existingPeople } = await supabase.from("people").select("id").in("id", batch)
        existingPeople?.forEach((p: any) => existingIds.add(p.id))
      }

      const nonExistentPersonFaces = allPhotoFacesWithPerson.filter((pf) => !existingIds.has(pf.person_id!))

      photoFaces.nonExistentPerson = nonExistentPersonFaces.length
      console.log("[v2.1] nonExistentPerson count:", photoFaces.nonExistentPerson)
      if (nonExistentPersonFaces.length > 0) {
        details.nonExistentPersonFaces = nonExistentPersonFaces.slice(0, 10).map((item: any) => ({
          ...item,
          bbox: item.insightface_bbox,
        }))
      }
    }

    // 5. Photo_id не существует в gallery_images (С ПАГИНАЦИЕЙ)
    const allPhotoFacesWithPhotos = await loadAllPhotoFaces<{ id: string; photo_id: string; insightface_bbox: any }>(
      supabase,
      "id, photo_id, insightface_bbox"
    )
    console.log(`[v2.1] Total photo_faces loaded for nonExistentPhoto check: ${allPhotoFacesWithPhotos.length}`)

    if (allPhotoFacesWithPhotos.length > 0) {
      const photoIds = [...new Set(allPhotoFacesWithPhotos.map((pf) => pf.photo_id))]

      const existingPhotoIds = new Set<string>()
      for (let i = 0; i < photoIds.length; i += 500) {
        const batch = photoIds.slice(i, i + 500)
        const { data: existingPhotos } = await supabase.from("gallery_images").select("id").in("id", batch)
        existingPhotos?.forEach((p: any) => existingPhotoIds.add(p.id))
      }

      const nonExistentPhotoFaces = allPhotoFacesWithPhotos.filter((pf) => !existingPhotoIds.has(pf.photo_id))

      photoFaces.nonExistentPhoto = nonExistentPhotoFaces.length
      console.log("[v2.1] nonExistentPhoto count:", photoFaces.nonExistentPhoto)
      if (nonExistentPhotoFaces.length > 0) {
        details.nonExistentPhotoFaces = nonExistentPhotoFaces.slice(0, 50).map((item: any) => ({
          ...item,
          bbox: item.insightface_bbox,
        }))
      }
    }

    // 6. Orphaned links (С ПАГИНАЦИЕЙ)
    const confidenceThreshold = await getConfidenceThreshold()
    console.log(`[v2.1] Using confidence threshold: ${confidenceThreshold}`)

    const allFacesForOrphaned = await loadAllPhotoFaces<any>(
      supabase,
      `id, photo_id, person_id, verified, recognition_confidence, insightface_bbox,
       gallery_images(id, image_url, original_filename, gallery_id, galleries(title, shoot_date)),
       people(real_name)`,
      (q) => q.not("person_id", "is", null).not("insightface_descriptor", "is", null).eq("verified", false)
    )
    console.log(`[v2.1] Total faces for orphaned check loaded: ${allFacesForOrphaned.length}`)

    const orphanedLinks = allFacesForOrphaned.filter(
      (face) => (face.recognition_confidence || 0) < confidenceThreshold
    )

    photoFaces.orphanedLinks = orphanedLinks.length
    console.log("[v2.1] orphanedLinks count:", photoFaces.orphanedLinks)
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

    // 7. Unrecognized faces (count only)
    const unrecognizedCount = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .is("person_id", null)
      .not("insightface_descriptor", "is", null)

    photoFaces.unrecognizedFaces = unrecognizedCount.count || 0
    console.log("[v2.1] unrecognizedFaces (info only) count:", photoFaces.unrecognizedFaces)

    // ========== PEOPLE CHECKS ==========

    const { data: allPeopleData } = await supabase
      .from("people")
      .select("id, real_name, telegram_nickname, telegram_profile_url, facebook_profile_url, instagram_profile_url, gmail, avatar_url, created_at")
      .order("real_name", { ascending: true })

    // 8. People без фото - выводим сразу список имён
    if (allPeopleData) {
      const peopleWithFaces = new Set(allPhotoFacesWithPerson.map((pf) => pf.person_id))
      const peopleWithoutFacesList = allPeopleData.filter((p) => !peopleWithFaces.has(p.id))

      people.withoutFaces = peopleWithoutFacesList.length
      console.log("[v2.1] peopleWithoutFaces count:", people.withoutFaces)

      // Сохраняем только имена для вывода списком
      if (peopleWithoutFacesList.length > 0) {
        details.peopleWithoutFaces = peopleWithoutFacesList.map((p) => p.real_name)
      }
    }

    // 9. Duplicate people - проверка по 5 полям
    if (allPeopleData) {
      const duplicateGroups: Array<{ matchField: string; matchValue: string; people: any[] }> = []
      const processedPeopleIds = new Set<string>()

      // Подсчитываем фото для каждого человека
      const photoCountMap = new Map<string, number>()
      allPhotoFacesWithPerson?.forEach((pf: any) => {
        photoCountMap.set(pf.person_id, (photoCountMap.get(pf.person_id) || 0) + 1)
      })

      for (const field of DUPLICATE_CHECK_FIELDS) {
        // Группируем по значению поля
        const valueGroups = new Map<string, any[]>()

        for (const person of allPeopleData) {
          const value = person[field as keyof typeof person]
          if (!value || typeof value !== "string" || value.trim() === "") continue

          const normalizedValue = value.trim().toLowerCase()
          if (!valueGroups.has(normalizedValue)) {
            valueGroups.set(normalizedValue, [])
          }
          valueGroups.get(normalizedValue)!.push(person)
        }

        // Находим группы с 2+ людьми
        for (const [value, peopleInGroup] of valueGroups) {
          if (peopleInGroup.length < 2) continue

          // Проверяем, не были ли эти люди уже добавлены в другую группу
          const newPeople = peopleInGroup.filter((p) => !processedPeopleIds.has(p.id))
          if (newPeople.length < 2) continue

          // Добавляем группу дубликатов
          duplicateGroups.push({
            matchField: field,
            matchValue: value,
            people: peopleInGroup.map((p) => ({
              ...p,
              photo_count: photoCountMap.get(p.id) || 0,
            })),
          })

          // Помечаем людей как обработанных
          peopleInGroup.forEach((p) => processedPeopleIds.add(p.id))
        }
      }

      people.duplicatePeople = duplicateGroups.length
      console.log("[v2.1] duplicatePeople groups:", people.duplicatePeople)

      if (duplicateGroups.length > 0) {
        details.duplicatePeople = duplicateGroups
      }
    }

    // ========== CALCULATE TOTAL ==========

    totalIssues =
      photoFaces.verifiedWithoutPerson +
      photoFaces.verifiedWithWrongConfidence +
      photoFaces.confidenceWithoutVerified +
      photoFaces.personWithoutConfidence +
      photoFaces.nonExistentPerson +
      photoFaces.nonExistentPhoto +
      photoFaces.orphanedLinks

    // Дубликаты игроков тоже считаем как проблемы
    totalIssues += people.duplicatePeople

    const report: IntegrityReport = {
      stats,
      photoFaces,
      people,
      totalIssues,
      checksPerformed: 10,
      details,
    }

    console.log("[v2.1] Integrity check complete. Total issues:", totalIssues)

    return { success: true, data: report }
  } catch (error: any) {
    console.log("[v2.1] Error in integrity check:", error.message)
    logger.error("actions/integrity", "Error checking database integrity", error)
    return { success: false, error: error.message || "Failed to check database integrity" }
  }
}

// Алиас для совместимости
export const checkDatabaseIntegrityAction = checkDatabaseIntegrityFullAction
