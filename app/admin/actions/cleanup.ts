"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { logger } from "@/lib/logger"

export async function syncVerifiedAndConfidenceAction() {
  const supabase = await createClient()

  try {
    logger.debug("actions/cleanup", "Starting sync of verified and recognition_confidence fields...")

    // 1. Установить recognition_confidence=1.0 где verified=true
    const { data: verifiedRecords, error: verifiedError } = await supabase
      .from("photo_faces")
      .update({ recognition_confidence: 1.0 })
      .eq("verified", true)
      .neq("recognition_confidence", 1.0)
      .select("id")

    if (verifiedError) throw verifiedError

    const verifiedCount = verifiedRecords?.length || 0
    logger.debug(
      "actions/cleanup",
      `Updated ${verifiedCount} records: set recognition_confidence=1 where verified=true`,
    )

    // 2. Установить verified=true где recognition_confidence=1.0
    const { data: confidenceRecords, error: confidenceError } = await supabase
      .from("photo_faces")
      .update({ verified: true })
      .eq("recognition_confidence", 1.0)
      .eq("verified", false)
      .select("id")

    if (confidenceError) throw confidenceError

    const confidenceCount = confidenceRecords?.length || 0

    // 3. Проверить и исправить has_been_processed
    // Если у фото есть записи в photo_faces, значит оно было обработано
    const { data: photosWithFaces } = await supabase.from("photo_faces").select("photo_id")

    const photoIdsWithFaces = [...new Set((photosWithFaces || []).map((f) => f.photo_id))]

    // Находим фото которые имеют faces но has_been_processed=false
    let processedFixCount = 0
    const processedFixedList: Array<{ id: string; gallery_title: string; filename: string }> = []

    if (photoIdsWithFaces.length > 0) {
      // Сначала находим проблемные записи
      for (let i = 0; i < photoIdsWithFaces.length; i += 500) {
        const batch = photoIdsWithFaces.slice(i, i + 500)
        const { data: problematic } = await supabase
          .from("gallery_images")
          .select("id, original_filename, galleries(title)")
          .in("id", batch)
          .eq("has_been_processed", false)

        if (problematic) {
          for (const img of problematic) {
            processedFixedList.push({
              id: img.id,
              gallery_title: (img.galleries as any)?.title || "Unknown",
              filename: img.original_filename || img.id,
            })
          }
        }
      }

      // Теперь исправляем
      if (processedFixedList.length > 0) {
        const idsToFix = processedFixedList.map((f) => f.id)
        for (let i = 0; i < idsToFix.length; i += 500) {
          const batch = idsToFix.slice(i, i + 500)
          await supabase.from("gallery_images").update({ has_been_processed: true }).in("id", batch)
        }
        processedFixCount = processedFixedList.length
      }
    }

    // 4. Статистика
    const { count: totalVerified } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    const { count: totalConfidence1 } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("recognition_confidence", 1.0)

    const { count: totalProcessed } = await supabase
      .from("gallery_images")
      .select("*", { count: "exact", head: true })
      .eq("has_been_processed", true)

    const { count: totalImages } = await supabase.from("gallery_images").select("*", { count: "exact", head: true })

    logger.debug(
      "actions/cleanup",
      `Final stats: ${totalVerified} verified, ${totalConfidence1} recognition_confidence=1, ${totalProcessed} processed, ${totalImages} total images`,
    )

    revalidatePath("/admin")
    logger.info("actions/cleanup", "Sync verified and recognition_confidence completed", {
      verifiedCount,
      confidenceCount,
      processedFixCount,
      totalVerified,
      totalConfidence1,
      totalProcessed,
      totalImages,
    })

    return {
      success: true,
      data: {
        updatedVerified: verifiedCount,
        updatedConfidence: confidenceCount,
        updatedProcessed: processedFixCount,
        processedFixedList: processedFixedList.slice(0, 100), // Лимит для UI
        totalVerified: totalVerified || 0,
        totalConfidence1: totalConfidence1 || 0,
        totalProcessed: totalProcessed || 0,
        totalImages: totalImages || 0,
      },
    }
  } catch (error: any) {
    logger.error("actions/cleanup", "Error syncing verified and recognition_confidence", error)
    return { error: error.message || "Failed to sync verified and recognition_confidence" }
  }
}

export async function cleanupUnverifiedFacesAction() {
  logger.warn(
    "actions/cleanup",
    "cleanupUnverifiedFacesAction is DEPRECATED and disabled - use Database Integrity Checker instead",
  )
  return {
    success: false,
    error: "Эта функция устарела и отключена. Используйте 'Проверка целостности базы данных' для безопасной очистки.",
  }
}

export async function cleanupDuplicateFacesAction(dryRun = false) {
  const supabase = await createClient()

  try {
    logger.debug("actions/cleanup", `Starting ${dryRun ? "preview" : "cleanup"} of duplicate faces...`)

    const { count: totalBefore } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })

    // Load all records for analysis
    let allRecords: any[] = []
    let hasMore = true
    let offset = 0
    const pageSize = 1000

    while (hasMore) {
      const { data: batch, error: batchError } = await supabase
        .from("photo_faces")
        .select("id, photo_id, person_id, verified, recognition_confidence, created_at")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (batchError) throw batchError

      if (batch && batch.length > 0) {
        allRecords = allRecords.concat(batch)
        offset += pageSize
        hasMore = batch.length === pageSize
      } else {
        hasMore = false
      }
    }

    logger.debug("actions/cleanup", `Loaded ${allRecords.length} records for analysis`)

    // Group records by person_id + photo_id, but SKIP records with person_id=null
    // (they are different unknown faces and should NOT be grouped!)
    const groupedRecords = new Map<string, any[]>()
    for (const record of allRecords) {
      if (record.person_id === null) continue

      const key = `${record.person_id}_${record.photo_id}`
      if (!groupedRecords.has(key)) {
        groupedRecords.set(key, [])
      }
      groupedRecords.get(key)!.push(record)
    }

    const duplicateGroups = Array.from(groupedRecords.entries()).filter(([_, records]) => records.length > 1)
    logger.debug("actions/cleanup", `Found ${duplicateGroups.length} groups with duplicates`)

    // Prepare preview or deletion list
    let totalDeleted = 0
    const idsToDelete: string[] = []
    const previewGroups: any[] = []

    for (const [key, records] of duplicateGroups) {
      // Sort by priority: verified > confidence > oldest
      records.sort((a, b) => {
        if (a.verified !== b.verified) return b.verified ? 1 : -1
        if (a.recognition_confidence !== b.recognition_confidence)
          return (b.recognition_confidence || 0) - (a.recognition_confidence || 0)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      const keeper = records[0]
      const toDelete = records.slice(1)

      if (dryRun && previewGroups.length < 50) {
        previewGroups.push({
          key,
          totalRecords: records.length,
          keeper: {
            id: keeper.id,
            verified: keeper.verified,
            confidence: keeper.recognition_confidence,
            created_at: keeper.created_at,
          },
          toDelete: toDelete.map((r) => ({
            id: r.id,
            verified: r.verified,
            confidence: r.recognition_confidence,
            created_at: r.created_at,
          })),
        })
      }

      idsToDelete.push(...toDelete.map((r) => r.id))
      totalDeleted += toDelete.length
    }

    // If preview mode, return preview data
    if (dryRun) {
      return {
        success: true,
        data: {
          preview: true,
          totalRecords: allRecords.length,
          duplicateGroups: duplicateGroups.length,
          recordsToDelete: totalDeleted,
          previewGroups,
        },
      }
    }

    // Execute deletion in batches
    const batchSize = 100
    if (idsToDelete.length > 0) {
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize)
        const { error: deleteError } = await supabase.from("photo_faces").delete().in("id", batch)
        if (deleteError) throw deleteError
      }
    }

    logger.debug("actions/cleanup", `Deleted ${totalDeleted} duplicate photo_faces records`)

    const { count: totalAfter } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })
    const { count: verifiedAfter } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    logger.info("actions/cleanup", `Cleanup complete! Deleted ${totalDeleted} duplicates.`)

    revalidatePath("/admin")
    return {
      success: true,
      data: {
        preview: false,
        before: { total: totalBefore || 0 },
        after: { total: totalAfter || 0, verified: verifiedAfter || 0 },
        deleted: totalDeleted,
        duplicateGroups: duplicateGroups.length,
      },
    }
  } catch (error: any) {
    logger.error("actions/cleanup", "Error cleaning up duplicate faces", error)
    return { error: error.message || "Failed to cleanup duplicate faces" }
  }
}

export async function cleanupPersonDescriptorsAction(personRealName: string) {
  const supabase = await createClient()

  try {
    logger.debug("actions/cleanup", `Starting cleanup for person: ${personRealName}`)

    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id, real_name")
      .eq("real_name", personRealName)
      .single()

    if (personError || !person) {
      return { error: `Person not found: ${personRealName}` }
    }

    // For InsightFace, descriptors are in photo_faces.insightface_descriptor
    // So this is essentially a no-op for the new system
    logger.info("actions/cleanup", "This function is for legacy descriptors - skipping for InsightFace")

    return {
      success: true,
      data: {
        personName: person.real_name,
        message: "Legacy function - not applicable to InsightFace system",
      },
    }
  } catch (error: any) {
    logger.error("actions/cleanup", "Error in cleanup person descriptors", error)
    return { error: error.message || "Failed to cleanup person descriptors" }
  }
}

export async function cleanupDuplicateDescriptorsAction() {
  logger.warn(
    "actions/cleanup",
    "cleanupDuplicateDescriptorsAction is deprecated - use cleanupDuplicateFacesAction instead",
  )
  return {
    success: true,
    message: "This function is deprecated. Use cleanupDuplicateFacesAction instead.",
  }
}
