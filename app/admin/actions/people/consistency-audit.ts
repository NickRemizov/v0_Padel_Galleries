"use server"

/**
 * Consistency Audit Actions
 * 
 * Actions for auditing embedding consistency across all players:
 * - runConsistencyAuditAction
 * - auditAllEmbeddingsAction
 */

import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"
import type { ConsistencyAuditData, MassAuditData } from "./types"

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
