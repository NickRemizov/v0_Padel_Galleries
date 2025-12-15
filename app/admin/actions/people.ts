"use server"

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

// - getPersonPhotosAction (moved to entities.ts)
// - updatePersonAvatarAction (moved to entities.ts)
// - updatePersonVisibilityAction (moved to entities.ts)

export async function getPersonPhotosWithDetailsAction(personId: string) {
  try {
    console.log("[getPersonPhotosWithDetailsAction] Fetching for person:", personId)
    const result = await apiFetch(`/api/people/${personId}/photos-with-details`)
    console.log("[getPersonPhotosWithDetailsAction] Result:", result.success, "data count:", result.data?.length)

    if (!result.success) {
      return { success: false, error: result.error || "Unknown error" }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[getPersonPhotosWithDetailsAction] Error:", error)
    return { success: false, error: error.message || "Failed to get person photos with details" }
  }
}

export async function verifyPersonOnPhotoAction(photoId: string, personId: string) {
  try {
    console.log("[verifyPersonOnPhotoAction] Verifying:", { photoId, personId })
    const result = await apiFetch(`/api/people/${personId}/verify-on-photo?photo_id=${photoId}`, {
      method: "POST",
    })
    console.log("[verifyPersonOnPhotoAction] Result:", result)

    if (!result.success) {
      console.error("[verifyPersonOnPhotoAction] Failed:", result.error)
      return { success: false, error: result.error || "Unknown error" }
    }

    revalidatePath("/admin")
    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[verifyPersonOnPhotoAction] Error:", error)
    return { success: false, error: error.message || "Failed to verify person" }
  }
}

export async function unlinkPersonFromPhotoAction(photoId: string, personId: string) {
  try {
    console.log("[unlinkPersonFromPhotoAction] Unlinking:", { photoId, personId })
    const result = await apiFetch(`/api/people/${personId}/unlink-from-photo?photo_id=${photoId}`, {
      method: "POST",
    })
    console.log("[unlinkPersonFromPhotoAction] Result:", result)

    if (!result.success) {
      console.error("[unlinkPersonFromPhotoAction] Failed:", result.error)
      return { success: false, error: result.error || "Unknown error" }
    }

    // Check if anything was actually unlinked
    const unlinkedCount = result.data?.unlinked_count ?? 0
    console.log("[unlinkPersonFromPhotoAction] Unlinked count:", unlinkedCount)

    revalidatePath("/admin")
    return { success: true, data: { unlinked_count: unlinkedCount } }
  } catch (error: any) {
    console.error("[unlinkPersonFromPhotoAction] Error:", error)
    return { success: false, error: error.message || "Failed to unlink person from photo" }
  }
}

// ========== DUPLICATE PEOPLE DETECTION ==========

/**
 * Поля для проверки дубликатов
 */
const DUPLICATE_CHECK_FIELDS = [
  "gmail",
  "telegram_nickname", 
  "telegram_profile_url",
  "facebook_profile_url",
  "instagram_profile_url",
] as const

type DuplicateField = typeof DUPLICATE_CHECK_FIELDS[number]

export interface DuplicateGroup {
  matchField: DuplicateField
  matchValue: string
  people: DuplicatePerson[]
}

export interface DuplicatePerson {
  id: string
  real_name: string
  telegram_nickname: string | null
  telegram_profile_url: string | null
  facebook_profile_url: string | null
  instagram_profile_url: string | null
  gmail: string | null
  avatar_url: string | null
  photo_count: number
  created_at: string
}

/**
 * Найти дубликаты игроков по совпадению полей
 */
export async function findDuplicatePeopleAction(): Promise<{
  success: boolean
  data?: DuplicateGroup[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    logger.debug("actions/people", "Finding duplicate people...")

    // Загружаем всех людей с нужными полями
    const { data: allPeople, error: peopleError } = await supabase
      .from("people")
      .select("id, real_name, telegram_nickname, telegram_profile_url, facebook_profile_url, instagram_profile_url, gmail, avatar_url, created_at")
      .order("created_at", { ascending: true })

    if (peopleError) throw peopleError

    if (!allPeople || allPeople.length === 0) {
      return { success: true, data: [] }
    }

    // Подсчитываем фото для каждого человека
    const { data: photoCounts } = await supabase
      .from("photo_faces")
      .select("person_id")
      .not("person_id", "is", null)

    const photoCountMap = new Map<string, number>()
    photoCounts?.forEach((pf: any) => {
      photoCountMap.set(pf.person_id, (photoCountMap.get(pf.person_id) || 0) + 1)
    })

    // Ищем дубликаты по каждому полю
    const duplicateGroups: DuplicateGroup[] = []
    const processedPeopleIds = new Set<string>()

    for (const field of DUPLICATE_CHECK_FIELDS) {
      // Группируем по значению поля
      const valueGroups = new Map<string, typeof allPeople>()

      for (const person of allPeople) {
        const value = person[field]
        if (!value || typeof value !== "string" || value.trim() === "") continue

        const normalizedValue = value.trim().toLowerCase()
        if (!valueGroups.has(normalizedValue)) {
          valueGroups.set(normalizedValue, [])
        }
        valueGroups.get(normalizedValue)!.push(person)
      }

      // Находим группы с 2+ людьми
      for (const [value, people] of valueGroups) {
        if (people.length < 2) continue

        // Проверяем, не были ли эти люди уже добавлены в другую группу
        const newPeople = people.filter(p => !processedPeopleIds.has(p.id))
        if (newPeople.length < 2) continue

        // Добавляем группу дубликатов
        duplicateGroups.push({
          matchField: field,
          matchValue: value,
          people: people.map(p => ({
            ...p,
            photo_count: photoCountMap.get(p.id) || 0,
          })),
        })

        // Помечаем людей как обработанных
        people.forEach(p => processedPeopleIds.add(p.id))
      }
    }

    logger.info("actions/people", `Found ${duplicateGroups.length} duplicate groups`)

    return { success: true, data: duplicateGroups }
  } catch (error: any) {
    logger.error("actions/people", "Error finding duplicate people", error)
    return { success: false, error: error.message || "Failed to find duplicate people" }
  }
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
    console.error("[getConfidenceThreshold] Failed to get config:", error)
  }
  return 0.6 // fallback
}

/**
 * Удалить игрока (обнулить person_id на фото)
 */
export async function deletePersonWithUnlinkAction(personId: string): Promise<{
  success: boolean
  data?: { unlinkedPhotos: number }
  error?: string
}> {
  const supabase = await createClient()

  try {
    logger.debug("actions/people", `Deleting person ${personId} and unlinking photos...`)

    // 1. Обнуляем person_id на всех фото
    const { data: updatedFaces, error: updateError } = await supabase
      .from("photo_faces")
      .update({ 
        person_id: null, 
        verified: false, 
        recognition_confidence: null 
      })
      .eq("person_id", personId)
      .select("id")

    if (updateError) throw updateError

    const unlinkedPhotos = updatedFaces?.length || 0

    // 2. Удаляем самого игрока
    const { error: deleteError } = await supabase
      .from("people")
      .delete()
      .eq("id", personId)

    if (deleteError) throw deleteError

    logger.info("actions/people", `Deleted person ${personId}, unlinked ${unlinkedPhotos} photos`)

    revalidatePath("/admin")
    return { success: true, data: { unlinkedPhotos } }
  } catch (error: any) {
    logger.error("actions/people", "Error deleting person", error)
    return { success: false, error: error.message || "Failed to delete person" }
  }
}

/**
 * Объединить дублей в одного игрока
 * @param keepPersonId - ID игрока, которого оставляем
 * @param mergePersonIds - ID игроков, которых объединяем с основным
 */
export async function mergePeopleAction(
  keepPersonId: string,
  mergePersonIds: string[]
): Promise<{
  success: boolean
  data?: { 
    movedPhotos: number
    mergedFields: string[]
    deletedPeople: number 
  }
  error?: string
}> {
  const supabase = await createClient()

  try {
    logger.debug("actions/people", `Merging people ${mergePersonIds.join(", ")} into ${keepPersonId}...`)

    // Получаем порог confidence
    const confidenceThreshold = await getConfidenceThreshold()

    // 1. Загружаем данные основного игрока
    const { data: keepPerson, error: keepError } = await supabase
      .from("people")
      .select("*")
      .eq("id", keepPersonId)
      .single()

    if (keepError || !keepPerson) {
      throw new Error(`Main person not found: ${keepPersonId}`)
    }

    // 2. Загружаем данные дублей (сортируем по дате создания - последний приоритетнее)
    const { data: mergePeople, error: mergeError } = await supabase
      .from("people")
      .select("*")
      .in("id", mergePersonIds)
      .order("created_at", { ascending: false })

    if (mergeError) throw mergeError

    // 3. Переносим photo_faces с дублей на основного игрока
    let movedPhotos = 0
    for (const mergeId of mergePersonIds) {
      const { data: updated, error: updateError } = await supabase
        .from("photo_faces")
        .update({
          person_id: keepPersonId,
          verified: false,
          recognition_confidence: confidenceThreshold,
        })
        .eq("person_id", mergeId)
        .select("id")

      if (updateError) throw updateError
      movedPhotos += updated?.length || 0
    }

    // 4. Переносим заполненные поля с дублей в пустые поля основного
    const fieldsToMerge = [
      "telegram_nickname",
      "telegram_profile_url", 
      "facebook_profile_url",
      "instagram_profile_url",
      "gmail",
      "telegram_name",
      "paddle_ranking",
      "avatar_url",
    ]

    const mergedFields: string[] = []
    const updateData: Record<string, any> = {}

    for (const field of fieldsToMerge) {
      // Если поле у основного игрока пустое
      if (!keepPerson[field]) {
        // Ищем значение в дублях (последний приоритетнее)
        for (const mergePerson of mergePeople || []) {
          if (mergePerson[field]) {
            updateData[field] = mergePerson[field]
            mergedFields.push(field)
            break
          }
        }
      }
    }

    // Обновляем основного игрока если есть что обновлять
    if (Object.keys(updateData).length > 0) {
      const { error: updatePersonError } = await supabase
        .from("people")
        .update(updateData)
        .eq("id", keepPersonId)

      if (updatePersonError) throw updatePersonError
    }

    // 5. Удаляем дублей
    const { error: deleteError } = await supabase
      .from("people")
      .delete()
      .in("id", mergePersonIds)

    if (deleteError) throw deleteError

    logger.info("actions/people", 
      `Merged ${mergePersonIds.length} people into ${keepPersonId}, moved ${movedPhotos} photos, merged fields: ${mergedFields.join(", ")}`
    )

    revalidatePath("/admin")
    return { 
      success: true, 
      data: { 
        movedPhotos, 
        mergedFields,
        deletedPeople: mergePersonIds.length 
      } 
    }
  } catch (error: any) {
    logger.error("actions/people", "Error merging people", error)
    return { success: false, error: error.message || "Failed to merge people" }
  }
}
