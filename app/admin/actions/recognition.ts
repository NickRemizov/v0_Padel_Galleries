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
