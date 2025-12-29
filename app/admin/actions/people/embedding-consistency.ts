"use server"

/**
 * Embedding Consistency Actions
 * 
 * Actions for analyzing and managing face embedding consistency:
 * - getEmbeddingConsistencyAction
 * - clearFaceDescriptorAction
 * - setFaceExcludedAction
 * - clearPersonOutliersAction
 */

import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"
import type { ConsistencyData } from "./types"

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
