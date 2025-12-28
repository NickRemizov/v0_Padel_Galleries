"use server"

import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"
import { logger } from "@/lib/logger"

export async function getRecognitionConfigAction() {
  logger.debug("actions/recognition", "[getRecognitionConfigAction] Reading config from DB")

  try {
    // Правильный путь: /api/v2/config (training.router с prefix="/api/v2")
    const result = await apiFetch("/api/v2/config", {
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
            min_blur_score: 80,
          },
        },
      }
    }

    logger.debug("actions/recognition", "Config loaded successfully", result.data)
    return { success: true, config: result.data }
  } catch (error: any) {
    logger.error("actions/recognition", "Error reading config", error)
    return {
      success: false,
      config: {
        confidence_thresholds: { high_data: 0.6 },
        quality_filters: {
          min_detection_score: 0.7,
          min_face_size: 80,
          min_blur_score: 80,
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

/**
 * Get count of faces missing descriptors
 * Backend returns: { success, data: { count } }
 */
export async function getMissingDescriptorsCountAction(): Promise<{
  success: boolean
  count: number
  error?: string
}> {
  try {
    const result = await apiFetch("/api/recognition/missing-descriptors-count", {
      method: "GET",
    })
    
    if (!result.success) {
      return { success: false, count: 0, error: result.error }
    }
    
    return { success: true, count: result.data?.count ?? 0 }
  } catch (error) {
    logger.error("actions/recognition", "Error getting missing descriptors count", error)
    return { success: false, count: 0, error: String(error) }
  }
}

/**
 * Regenerate missing descriptors for all faces
 * Backend returns: { success, data: { total_faces, regenerated, failed, details } }
 */
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
    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/recognition/regenerate-missing-descriptors", {
      method: "POST",
      headers,
    })
    
    if (!result.success) {
      return {
        success: false,
        total_faces: 0,
        regenerated: 0,
        failed: 0,
        details: [],
        error: result.error,
      }
    }
    
    return {
      success: true,
      total_faces: result.data?.total_faces ?? 0,
      regenerated: result.data?.regenerated ?? 0,
      failed: result.data?.failed ?? 0,
      details: result.data?.details ?? [],
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

export async function getMissingDescriptorsListAction(): Promise<{
  success: boolean
  faces: Array<{
    face_id: string
    photo_id: string
    person_id: string
    person_name: string
    filename: string
    gallery_name: string
    image_url: string
    bbox: any
  }>
  count: number
  error?: string
}> {
  logger.debug("actions/recognition", "[getMissingDescriptorsListAction] Getting list")

  try {
    const result = await apiFetch("/api/recognition/missing-descriptors-list", {
      method: "GET",
    })

    if (!result.success) {
      return { success: false, faces: [], count: 0, error: result.error || "Failed to get list" }
    }

    return { 
      success: true, 
      faces: result.data?.faces ?? [], 
      count: result.data?.count ?? 0 
    }
  } catch (error: any) {
    logger.error("actions/recognition", "Error getting missing descriptors list", error)
    return { success: false, faces: [], count: 0, error: error.message || String(error) }
  }
}

/**
 * Regenerate descriptor for a single face
 * Backend returns: { success, data: { success, iou, det_score } }
 */
export async function regenerateSingleDescriptorAction(faceId: string): Promise<{
  success: boolean
  iou?: number
  det_score?: number
  error?: string
}> {
  try {
    const headers = await getAuthHeaders()
    const result = await apiFetch(`/api/recognition/regenerate-single-descriptor?face_id=${faceId}`, {
      method: "POST",
      headers,
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { 
      success: true,
      iou: result.data?.iou,
      det_score: result.data?.det_score,
    }
  } catch (error: any) {
    logger.error("actions/recognition", `Error regenerating descriptor for ${faceId}`, error)
    return { success: false, error: error.message || String(error) }
  }
}

/**
 * Получить список галерей с необработанными фото
 * Использует бэкенд API: GET /api/galleries/with-unprocessed-photos
 */
export async function getGalleriesWithUnprocessedPhotosAction(): Promise<{
  success: boolean
  galleries: Array<{
    id: string
    title: string
    shoot_date: string | null
    total_photos: number
    unprocessed_photos: number
  }>
  error?: string
}> {
  try {
    logger.debug("actions/recognition", "[getGalleriesWithUnprocessedPhotosAction] Fetching from backend")

    const result = await apiFetch("/api/galleries/with-unprocessed-photos", {
      method: "GET",
    })

    if (!result.success) {
      return { success: false, galleries: [], error: result.error || "Failed to get galleries" }
    }

    return { success: true, galleries: result.data || [] }
  } catch (error: any) {
    logger.error("actions/recognition", "Error getting galleries with unprocessed photos", error)
    return { success: false, galleries: [], error: error.message || String(error) }
  }
}

/**
 * Получить список галерей с неверифицированными лицами (recognition_confidence < 1)
 * Использует бэкенд API: GET /api/galleries/with-unverified-faces
 */
export async function getGalleriesWithUnverifiedFacesAction(): Promise<{
  success: boolean
  galleries: Array<{
    id: string
    title: string
    shoot_date: string | null
    total_photos: number
    unverified_photos: number
  }>
  error?: string
}> {
  try {
    logger.debug("actions/recognition", "[getGalleriesWithUnverifiedFacesAction] Fetching from backend")

    const result = await apiFetch("/api/galleries/with-unverified-faces", {
      method: "GET",
    })

    if (!result.success) {
      return { success: false, galleries: [], error: result.error || "Failed to get galleries" }
    }

    return { success: true, galleries: result.data || [] }
  } catch (error: any) {
    logger.error("actions/recognition", "Error getting galleries with unverified faces", error)
    return { success: false, galleries: [], error: error.message || String(error) }
  }
}

/**
 * Получить фото галереи для распознавания (необработанные)
 * Использует бэкенд API: GET /api/galleries/{gallery_id}/unprocessed-photos
 */
export async function getGalleryPhotosForRecognitionAction(galleryId: string): Promise<{
  success: boolean
  images: Array<{
    id: string
    image_url: string
    original_filename: string
  }>
  error?: string
}> {
  try {
    logger.debug("actions/recognition", `[getGalleryPhotosForRecognitionAction] Gallery: ${galleryId}`)

    const result = await apiFetch(`/api/galleries/${galleryId}/unprocessed-photos`, {
      method: "GET",
    })

    if (!result.success) {
      return { success: false, images: [], error: result.error || "Failed to get photos" }
    }

    return { success: true, images: result.data || [] }
  } catch (error: any) {
    logger.error("actions/recognition", "Error getting gallery photos for recognition", error)
    return { success: false, images: [], error: error.message || String(error) }
  }
}

/**
 * Получить фото галереи с неверифицированными лицами (recognition_confidence < 1)
 * Использует бэкенд API: GET /api/galleries/{gallery_id}/unverified-photos
 */
export async function getGalleryUnverifiedPhotosAction(galleryId: string): Promise<{
  success: boolean
  images: Array<{
    id: string
    image_url: string
    original_filename: string
  }>
  error?: string
}> {
  try {
    logger.debug("actions/recognition", `[getGalleryUnverifiedPhotosAction] Gallery: ${galleryId}`)

    const result = await apiFetch(`/api/galleries/${galleryId}/unverified-photos`, {
      method: "GET",
    })

    if (!result.success) {
      return { success: false, images: [], error: result.error || "Failed to get photos" }
    }

    return { success: true, images: result.data || [] }
  } catch (error: any) {
    logger.error("actions/recognition", "Error getting gallery unverified photos", error)
    return { success: false, images: [], error: error.message || String(error) }
  }
}

/**
 * Глобальная кластеризация неизвестных лиц (по всей базе)
 * Вызывает бэкенд без gallery_id
 * Backend returns: { success, data: { clusters, ungrouped_faces } }
 */
export async function clusterAllUnknownFacesAction(): Promise<{
  success: boolean
  data?: {
    clusters: Array<{
      cluster_id: number
      size: number
      faces: Array<{
        id: string
        photo_id: string
        image_url: string
        bbox: { x: number; y: number; width: number; height: number }
        gallery_id?: string
        gallery_title?: string
        shoot_date?: string
      }>
    }>
    ungrouped_faces: any[]
  }
  error?: string
}> {
  try {
    logger.debug("actions/recognition", "[clusterAllUnknownFacesAction] Starting global clustering")

    const headers = await getAuthHeaders()
    // Вызываем без gallery_id - бэкенд вернёт кластеры по всей базе
    const result = await apiFetch<{ clusters: any[]; ungrouped_faces: any[] }>(
      `/api/recognition/cluster-unknown-faces?min_cluster_size=2`,
      {
        method: "POST",
        headers,
      },
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    logger.debug("actions/recognition", `[clusterAllUnknownFacesAction] Found ${result.data?.clusters?.length || 0} clusters`)

    return {
      success: true,
      data: {
        clusters: result.data?.clusters ?? [],
        ungrouped_faces: result.data?.ungrouped_faces ?? [],
      },
    }
  } catch (error: any) {
    logger.error("actions/recognition", "Error clustering all unknown faces", error)
    return {
      success: false,
      error: error.message || String(error),
    }
  }
}

/**
 * Отклонить (удалить) кластер лиц
 * Удаляет лица из photo_faces таблицы
 * Backend returns: { success, data: { deleted } }
 */
export async function rejectFaceClusterAction(faceIds: string[]): Promise<{
  success: boolean
  deleted?: number
  error?: string
}> {
  try {
    logger.debug("actions/recognition", `[rejectFaceClusterAction] Rejecting ${faceIds.length} faces`)

    const headers = await getAuthHeaders()
    const result = await apiFetch<{ deleted: number }>(
      `/api/recognition/reject-face-cluster`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(faceIds),
      },
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    logger.debug("actions/recognition", `[rejectFaceClusterAction] Deleted ${result.data?.deleted ?? 0} faces`)

    return {
      success: true,
      deleted: result.data?.deleted ?? 0,
    }
  } catch (error: any) {
    logger.error("actions/recognition", "Error rejecting face cluster", error)
    return {
      success: false,
      error: error.message || String(error),
    }
  }
}
