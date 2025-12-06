"use server"

import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/api-fetch"
import { logger } from "@/lib/logger"

export async function getPhotographersAction() {
  try {
    const result = await apiFetch("/api/photographers", {
      method: "GET",
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to get photographers")
    }

    return { success: true, data: result.data }
  } catch (error: any) {
    logger.error("actions/photographers", "Error getting photographers", error)
    return { error: error.message || "Failed to get photographers" }
  }
}

export async function addPhotographerAction(name: string) {
  try {
    const result = await apiFetch("/api/photographers", {
      method: "POST",
      body: JSON.stringify({ name }),
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to add photographer")
    }

    revalidatePath("/admin")
    logger.info("actions/photographers", "Photographer added successfully", { name })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/photographers", "Error adding photographer", error)
    return { error: error.message || "Failed to add photographer" }
  }
}

export async function updatePhotographerAction(photographerId: string, name: string) {
  try {
    const result = await apiFetch(`/api/photographers/${photographerId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to update photographer")
    }

    revalidatePath("/admin")
    logger.info("actions/photographers", "Photographer updated successfully", { photographerId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/photographers", "Error updating photographer", error)
    return { error: error.message || "Failed to update photographer" }
  }
}

export async function deletePhotographerAction(photographerId: string) {
  try {
    const result = await apiFetch(`/api/photographers/${photographerId}`, {
      method: "DELETE",
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to delete photographer")
    }

    revalidatePath("/admin")
    logger.info("actions/photographers", "Photographer deleted successfully", { photographerId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/photographers", "Error deleting photographer", error)
    return { error: error.message || "Failed to delete photographer" }
  }
}
