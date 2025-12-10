"use server"

import { apiFetch } from "@/lib/apiClient"
import { logger } from "@/lib/logger"

export async function getRecognitionConfigAction() {
  logger.debug("actions/recognition", "[getRecognitionConfigAction] Reading config from DB")

  try {
    const result = await apiFetch("/api/v2/training/config", {
      method: "GET",
    })

    if (!result.success) {
      logger.warn("actions/recognition", "Failed to read config, using defaults")
      return {
        success: false,
        config: {
          confidence_thresholds: { high_data: 0.6 },
          quality_filters: {
            min_detection_score: 0.7,
            min_face_size: 80,
            min_blur_score: 100,
          },
        },
      }
    }

    logger.debug("actions/recognition", "Config loaded successfully")
    return { success: true, config: result }
  } catch (error: any) {
    logger.error("actions/recognition", "Error reading config", error)
    return {
      success: false,
      config: {
        confidence_thresholds: { high_data: 0.6 },
        quality_filters: {
          min_detection_score: 0.7,
          min_face_size: 80,
          min_blur_score: 100,
        },
      },
    }
  }
}

export async function getRecognitionStatsAction(confidenceThreshold = 0.6) {
  logger.debug(
    "actions/recognition",
    `[getRecognitionStatsAction] Starting with confidence threshold: ${confidenceThreshold}`,
  )

  try {
    const result = await apiFetch(`/api/faces/statistics?confidence_threshold=${confidenceThreshold}`, {
      method: "GET",
    })

    if (!result.success) {
      return { error: result.error || "Failed to get statistics" }
    }

    logger.debug("actions/recognition", "Completed getRecognitionStatsAction successfully")
    return { success: true, data: result.data }
  } catch (error: any) {
    logger.error("actions/recognition", "Error getting recognition stats", error)
    return { error: error.message || "Failed to get recognition stats" }
  }
}

export async function getMissingDescriptorsCountAction(): Promise<{
  success: boolean
  count: number
  error?: string
}> {
  try {
    const result = await apiFetch("/api/recognition/missing-descriptors-count", {
      method: "GET",
    })
    return { success: true, count: result.count || 0 }
  } catch (error) {
    logger.error("actions/recognition", "Error getting missing descriptors count", error)
    return { success: false, count: 0, error: String(error) }
  }
}

export async function regenerateMissingDescriptorsAction(): Promise<{
  success: boolean
  total_faces: number
  regenerated: number
  failed: number
  details: Array<{
    face_id: string
    person_name: string
    status: "success" | "error"
    error?: string
    iou?: number
  }>
  error?: string
}> {
  try {
    const result = await apiFetch("/api/recognition/regenerate-missing-descriptors", {
      method: "POST",
    })
    return {
      success: true,
      total_faces: result.total_faces || 0,
      regenerated: result.regenerated || 0,
      failed: result.failed || 0,
      details: result.details || [],
    }
  } catch (error) {
    logger.error("actions/recognition", "Error regenerating missing descriptors", error)
    return {
      success: false,
      total_faces: 0,
      regenerated: 0,
      failed: 0,
      details: [],
      error: String(error),
    }
  }
}
