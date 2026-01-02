"use server"

/**
 * Index Operations Actions
 *
 * Server actions for HNSW index management:
 * - getIndexStatusAction
 * - rebuildIndexAction
 */

import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"

export interface IndexStatus {
  loaded: boolean
  total_embeddings?: number
  unique_people?: number
  verified_count?: number
  excluded_count?: number
  deleted_in_index?: number
  capacity?: number
  last_rebuild_time?: string
  message?: string
}

export async function getIndexStatusAction(): Promise<{
  success: boolean
  data?: IndexStatus
  error?: string
}> {
  try {
    const result = await apiFetch("/api/recognition/index-status", {
      method: "GET",
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to get index status")
    }

    return { success: true, data: result.data }
  } catch (error) {
    console.error("[getIndexStatusAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function rebuildIndexAction(): Promise<{
  success: boolean
  data?: {
    old_descriptor_count: number
    new_descriptor_count: number
    unique_people_count: number
  }
  error?: string
}> {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/recognition/rebuild-index", {
      method: "POST",
      headers,
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to rebuild index")
    }

    return { success: true, data: result.data }
  } catch (error) {
    console.error("[rebuildIndexAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
