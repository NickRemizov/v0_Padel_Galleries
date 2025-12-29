"use server"

/**
 * Recognition Actions
 * 
 * Actions for face recognition:
 * - clusterUnknownFacesAction
 * - recognizeUnknownFacesAction
 */

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"

/**
 * Cluster unknown faces for review.
 * Backend returns ApiResponse format: {success, data: {clusters, ungrouped_faces}}
 *
 * @param galleryId - Gallery ID to cluster faces from
 */
export async function clusterUnknownFacesAction(galleryId: string) {
  try {
    console.log("[v0] [clusterUnknownFacesAction] START - Gallery ID:", galleryId)

    const headers = await getAuthHeaders()
    const result = await apiFetch<{ success: boolean; data: { clusters: any[]; ungrouped_faces: any[] } }>(
      `/api/recognition/cluster-unknown-faces?gallery_id=${galleryId}&min_cluster_size=2`,
      {
        method: "POST",
        headers,
      },
    )

    console.log("[v0] [clusterUnknownFacesAction] FastAPI raw response:", JSON.stringify(result, null, 2))

    // Backend returns ApiResponse: {success, data: {clusters, ungrouped_faces}}
    const clusters = result.data?.clusters || []
    const ungroupedFaces = result.data?.ungrouped_faces || []

    console.log("[v0] [clusterUnknownFacesAction] Clusters count:", clusters.length)

    return {
      success: true,
      data: {
        clusters: clusters,
        ungrouped_faces: ungroupedFaces,
      },
    }
  } catch (error) {
    console.error(
      "[v0] [clusterUnknownFacesAction] Full error:",
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    )
    console.error(
      "[v0] [clusterUnknownFacesAction] Error message:",
      error instanceof Error ? error.message : String(error),
    )
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Recognize all unknown faces by running them through the recognition algorithm.
 * Useful after manually assigning photos to a new player.
 *
 * @param galleryId - Optional gallery ID to filter faces
 * @param confidenceThreshold - Optional confidence threshold (uses config default if not provided)
 */
export async function recognizeUnknownFacesAction(galleryId?: string, confidenceThreshold?: number) {
  try {
    console.log("[recognizeUnknownFacesAction] START - Gallery ID:", galleryId)

    const headers = await getAuthHeaders()
    const result = await apiFetch("/api/faces/recognize-unknown", {
      method: "POST",
      headers,
      body: JSON.stringify({
        gallery_id: galleryId || null,
        confidence_threshold: confidenceThreshold || null,
      }),
    })

    console.log("[recognizeUnknownFacesAction] Response:", JSON.stringify(result, null, 2))

    if (result.success) {
      revalidatePath("/admin")
      return {
        success: true,
        total_unknown: result.data?.total_unknown ?? 0,
        recognized_count: result.data?.recognized_count ?? 0,
        by_person: result.data?.by_person ?? [],
        index_rebuilt: result.data?.index_rebuilt ?? false,
      }
    } else {
      return {
        success: false,
        error: result.error || "Failed to recognize unknown faces",
      }
    }
  } catch (error) {
    console.error("[recognizeUnknownFacesAction] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
