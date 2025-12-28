"use server"

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"
import { createClient } from "@/lib/supabase/server"
import { getAuthHeaders } from "@/lib/auth/serverGuard"
import { logger } from "@/lib/logger"

/**
 * People actions
 * v2.1: Added pagination to findDuplicatePeopleAction
 * v2.2: Added auth headers to all FastAPI write operations
 * v2.3: Consolidated getAuthHeaders from lib/auth/serverGuard
 */

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
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/people/${personId}/verify-on-photo?photo_id=${photoId}`, {
      method: "POST",
      headers,
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
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/people/${personId}/unlink-from-photo?photo_id=${photoId}`, {
      method: "POST",
      headers,
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

// ========== EMBEDDING CONSISTENCY ==========

export interface EmbeddingResult {
  face_id: string
  photo_id: string
  image_url: string | null
  filename: string | null
  image_width: number | null
  image_height: number | null
  bbox: number[] | null  // [x1, y1, x2, y2] from insightface
  verified: boolean
  recognition_confidence: number | null
  similarity_to_centroid: number
  is_outlier: boolean
  is_excluded: boolean  // NEW: excluded from index
}

export interface ConsistencyData {
  total_embeddings: number
  overall_consistency: number
  outlier_threshold: number
  outlier_count: number
  excluded_count: number  // NEW: count of excluded embeddings
  embeddings: EmbeddingResult[]
  message?: string
}

/**
 * Get embedding consistency analysis for a person
 */
export async function getEmbeddingConsistencyAction(
  personId: string,
  outlierThreshold: number = 0.5
): Promise<{ success: boolean; data?: ConsistencyData; error?: string }> {
  try {
    console.log("[getEmbeddingConsistencyAction] Analyzing:", personId)
    const result = await apiFetch(
      `/api/people/${personId}/embedding-consistency?outlier_threshold=${outlierThreshold}`
    )
    console.log("[getEmbeddingConsistencyAction] Result:", result.success)

    if (!result.success) {
      return { success: false, error: result.error || "Unknown error" }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[getEmbeddingConsistencyAction] Error:", error)
    return { success: false, error: error.message || "Failed to get embedding consistency" }
  }
}

/**
 * Clear descriptor from a face (set to NULL)
 */
export async function clearFaceDescriptorAction(faceId: string): Promise<{
  success: boolean
  data?: { cleared: boolean; face_id: string; person_id: string | null; index_rebuilt: boolean }
  error?: string
}> {
  try {
    console.log("[clearFaceDescriptorAction] Clearing:", faceId)
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/faces/${faceId}/clear-descriptor`, {
      method: "POST",
      headers,
    })
    console.log("[clearFaceDescriptorAction] Result:", result)

    if (!result.success) {
      return { success: false, error: result.error || "Unknown error" }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[clearFaceDescriptorAction] Error:", error)
    return { success: false, error: error.message || "Failed to clear descriptor" }
  }
}

/**
 * Exclude/include a face from recognition index
 */
export async function setFaceExcludedAction(
  faceId: string,
  excluded: boolean
): Promise<{
  success: boolean
  data?: { updated: boolean }
  error?: string
}> {
  try {
    console.log("[setFaceExcludedAction] Setting excluded:", faceId, excluded)
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/faces/${faceId}/set-excluded?excluded=${excluded}`, {
      method: "POST",
      headers,
    })
    console.log("[setFaceExcludedAction] Result:", result)

    if (!result.success) {
      return { success: false, error: result.error || "Unknown error" }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[setFaceExcludedAction] Error:", error)
    return { success: false, error: error.message || "Failed to set excluded status" }
  }
}

/**
 * Clear all outlier descriptors for a person (marks as excluded, not deleted)
 */
export async function clearPersonOutliersAction(
  personId: string,
  outlierThreshold: number = 0.5
): Promise<{
  success: boolean
  data?: { cleared_count: number; index_rebuilt: boolean; message?: string }
  error?: string
}> {
  try {
    console.log("[clearPersonOutliersAction] Clearing outliers for:", personId)
    const headers = await getAuthHeaders()
    const result = await apiFetch(
      `/api/people/${personId}/clear-outliers?outlier_threshold=${outlierThreshold}`,
      { method: "POST", headers }
    )
    console.log("[clearPersonOutliersAction] Result:", result)

    if (!result.success) {
      return { success: false, error: result.error || "Unknown error" }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[clearPersonOutliersAction] Error:", error)
    return { success: false, error: error.message || "Failed to clear outliers" }
  }
}

// ========== CONSISTENCY AUDIT (all players) ==========

export interface ConsistencyAuditResult {
  person_id: string
  person_name: string
  photo_count: number
  descriptor_count: number
  outlier_count: number
  excluded_count: number  // NEW
  overall_consistency: number
  has_problems: boolean
}

export interface ConsistencyAuditData {
  total_people: number
  people_with_problems: number
  total_outliers: number
  total_excluded: number  // NEW
  outlier_threshold: number
  results: ConsistencyAuditResult[]
}

/**
 * Run consistency audit for all players
 */
export async function runConsistencyAuditAction(
  outlierThreshold: number = 0.5,
  minDescriptors: number = 2
): Promise<{ success: boolean; data?: ConsistencyAuditData; error?: string }> {
  try {
    console.log("[runConsistencyAuditAction] Starting audit...")
    const result = await apiFetch(
      `/api/people/consistency-audit?outlier_threshold=${outlierThreshold}&min_descriptors=${minDescriptors}`
    )
    console.log("[runConsistencyAuditAction] Result:", result.success)

    if (!result.success) {
      return { success: false, error: result.error || "Unknown error" }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[runConsistencyAuditAction] Error:", error)
    return { success: false, error: error.message || "Failed to run consistency audit" }
  }
}

// ========== MASS AUDIT (mark outliers as excluded) ==========

export interface MassAuditPersonResult {
  person_id: string
  person_name: string
  newly_excluded: number
  total_excluded: number
  total_descriptors: number
}

export interface MassAuditData {
  people_processed: number
  people_affected: number
  total_newly_excluded: number
  index_rebuilt: boolean
  results: MassAuditPersonResult[]
}

/**
 * Run mass audit and mark all outliers as excluded
 */
export async function auditAllEmbeddingsAction(
  outlierThreshold: number = 0.5,
  minDescriptors: number = 3
): Promise<{ success: boolean; data?: MassAuditData; error?: string }> {
  try {
    console.log("[auditAllEmbeddingsAction] Starting mass audit...")
    const headers = await getAuthHeaders()
    const result = await apiFetch(
      `/api/people/audit-all-embeddings?outlier_threshold=${outlierThreshold}&min_descriptors=${minDescriptors}`,
      { method: "POST", headers }
    )
    console.log("[auditAllEmbeddingsAction] Result:", result.success)

    if (!result.success) {
      return { success: false, error: result.error || "Unknown error" }
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    console.error("[auditAllEmbeddingsAction] Error:", error)
    return { success: false, error: error.message || "Failed to run mass audit" }
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
 * v2.1: Added pagination for photo_faces query
 * 
 * NOTE: This function uses direct Supabase access (read-only).
 * TODO: Move to FastAPI backend for consistency.
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

    // Подсчитываем фото для каждого человека (С ПАГИНАЦИЕЙ)
    let allPhotoCounts: any[] = []
    let offset = 0
    const pageSize = 1000

    while (true) {
      const { data: batch } = await supabase
        .from("photo_faces")
        .select("person_id")
        .not("person_id", "is", null)
        .range(offset, offset + pageSize - 1)

      if (!batch || batch.length === 0) break
      allPhotoCounts = allPhotoCounts.concat(batch)
      if (batch.length < pageSize) break
      offset += pageSize
    }

    console.log(`[v2.1] Loaded ${allPhotoCounts.length} photo_faces with pagination`)

    const photoCountMap = new Map<string, number>()
    allPhotoCounts.forEach((pf: any) => {
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
 * 
 * NOTE: This function uses direct Supabase access (write operation).
 * TODO: Move to FastAPI backend for proper auth protection.
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
 * 
 * NOTE: This function uses direct Supabase access (write operation).
 * TODO: Move to FastAPI backend for proper auth protection.
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
