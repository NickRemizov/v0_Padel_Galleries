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

    // 3. Статистика
    const { count: totalVerified } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    const { count: totalConfidence1 } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("recognition_confidence", 1.0)

    logger.debug(
      "actions/cleanup",
      `Final stats: ${totalVerified} verified, ${totalConfidence1} recognition_confidence=1`,
    )

    revalidatePath("/admin")
    logger.info("actions/cleanup", "Sync verified and recognition_confidence completed", {
      verifiedCount,
      confidenceCount,
      totalVerified,
      totalConfidence1,
    })

    return {
      success: true,
      data: {
        updatedVerified: verifiedCount,
        updatedConfidence: confidenceCount,
        totalVerified: totalVerified || 0,
        totalConfidence1: totalConfidence1 || 0,
      },
    }
  } catch (error: any) {
    logger.error("actions/cleanup", "Error syncing verified and recognition_confidence", error)
    return { error: error.message || "Failed to sync verified and recognition_confidence" }
  }
}

export async function cleanupUnverifiedFacesAction() {
  const supabase = await createClient()

  try {
    logger.debug("actions/cleanup", "Starting cleanup of unverified faces...")

    const { count: totalBefore } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })
    const { count: verifiedBefore } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    logger.debug("actions/cleanup", `Before cleanup: ${totalBefore} total, ${verifiedBefore} verified`)

    const { data: inconsistentRecords, error: inconsistentError } = await supabase
      .from("photo_faces")
      .select(
        "id, photo_id, person_id, verified, recognition_confidence, people(real_name, telegram_name), gallery_images(original_filename)",
      )
      .eq("verified", true)
      .neq("recognition_confidence", 1.0)

    if (inconsistentError) throw inconsistentError

    if (inconsistentRecords && inconsistentRecords.length > 0) {
      logger.warn(
        "actions/cleanup",
        `Found ${inconsistentRecords.length} records with verified=true but recognition_confidence != 1`,
      )
    }

    const { data: deletedRecords, error: deleteError } = await supabase
      .from("photo_faces")
      .delete()
      .eq("verified", false)
      .select("id")

    if (deleteError) throw deleteError

    const deletedCount = deletedRecords?.length || 0
    logger.debug("actions/cleanup", `Deleted ${deletedCount} unverified photo_faces records`)

    const { count: totalAfter } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })
    const { count: verifiedAfter } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)

    logger.debug("actions/cleanup", `After cleanup: ${totalAfter} total, ${verifiedAfter} verified`)
    logger.info("actions/cleanup", `Cleanup complete! Deleted ${deletedCount} unverified records.`)

    revalidatePath("/admin")
    return {
      success: true,
      data: {
        before: { total: totalBefore || 0, verified: verifiedBefore || 0 },
        after: { total: totalAfter || 0, verified: verifiedAfter || 0 },
        deleted: deletedCount,
        inconsistentRecords:
          inconsistentRecords?.map((record) => ({
            photoFilename: record.gallery_images?.original_filename || "Unknown",
            personName: record.people?.real_name || record.people?.telegram_name || "Unknown",
            recognition_confidence: record.recognition_confidence,
          })) || [],
      },
    }
  } catch (error: any) {
    logger.error("actions/cleanup", "Error cleaning up unverified faces", error)
    return { error: error.message || "Failed to cleanup unverified faces" }
  }
}

export async function cleanupDuplicateFacesAction() {
  const supabase = await createClient()

  try {
    logger.debug("actions/cleanup", "Starting cleanup of duplicate faces...")

    const { count: totalBefore } = await supabase.from("photo_faces").select("*", { count: "exact", head: true })

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

    const groupedRecords = new Map<string, any[]>()
    for (const record of allRecords) {
      const key = `${record.person_id}_${record.photo_id}`
      if (!groupedRecords.has(key)) {
        groupedRecords.set(key, [])
      }
      groupedRecords.get(key)!.push(record)
    }

    const duplicateGroups = Array.from(groupedRecords.entries()).filter(([_, records]) => records.length > 1)
    logger.debug("actions/cleanup", `Found ${duplicateGroups.length} groups with duplicates`)

    let totalDeleted = 0
    const idsToDelete: string[] = []

    for (const [key, records] of duplicateGroups) {
      records.sort((a, b) => {
        if (a.verified !== b.verified) return b.verified ? 1 : -1
        if (a.recognition_confidence !== b.recognition_confidence)
          return (b.recognition_confidence || 0) - (a.recognition_confidence || 0)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      const toDelete = records.slice(1)
      idsToDelete.push(...toDelete.map((r) => r.id))
      totalDeleted += toDelete.length
    }

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
