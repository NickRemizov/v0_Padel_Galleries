"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

// People
export async function addPersonAction(data: {
  real_name?: string
  telegram_name?: string
  telegram_nickname?: string
  telegram_profile_url?: string
  facebook_profile_url?: string
  instagram_profile_url?: string
  avatar_url?: string
  paddle_ranking?: number
  tournament_results?: any
}) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("people").insert(data)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Person added successfully")
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error adding person", error)
    return { error: error.message || "Failed to add person" }
  }
}

export async function updatePersonAction(
  personId: string,
  data: {
    real_name?: string
    telegram_name?: string
    telegram_nickname?: string
    telegram_profile_url?: string
    facebook_profile_url?: string
    instagram_profile_url?: string
    avatar_url?: string
    paddle_ranking?: number
    tournament_results?: any
  },
) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("people").update(data).eq("id", personId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Person updated successfully", { personId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error updating person", error)
    return { error: error.message || "Failed to update person" }
  }
}

export async function deletePersonAction(personId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("people").delete().eq("id", personId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Person deleted successfully", { personId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error deleting person", error)
    return { error: error.message || "Failed to delete person" }
  }
}

// Photographers
export async function addPhotographerAction(name: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("photographers").insert({ name })

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Photographer added successfully", { name })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error adding photographer", error)
    return { error: error.message || "Failed to add photographer" }
  }
}

export async function updatePhotographerAction(photographerId: string, name: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("photographers").update({ name }).eq("id", photographerId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Photographer updated successfully", { photographerId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error updating photographer", error)
    return { error: error.message || "Failed to update photographer" }
  }
}

export async function deletePhotographerAction(photographerId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("photographers").delete().eq("id", photographerId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Photographer deleted successfully", { photographerId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error deleting photographer", error)
    return { error: error.message || "Failed to delete photographer" }
  }
}

// Locations
export async function addLocationAction(name: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("locations").insert({ name })

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Location added successfully", { name })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error adding location", error)
    return { error: error.message || "Failed to add location" }
  }
}

export async function updateLocationAction(locationId: string, name: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("locations").update({ name }).eq("id", locationId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Location updated successfully", { locationId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error updating location", error)
    return { error: error.message || "Failed to update location" }
  }
}

export async function deleteLocationAction(locationId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("locations").delete().eq("id", locationId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Location deleted successfully", { locationId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error deleting location", error)
    return { error: error.message || "Failed to delete location" }
  }
}

// Organizers
export async function addOrganizerAction(name: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("organizers").insert({ name })

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Organizer added successfully", { name })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error adding organizer", error)
    return { error: error.message || "Failed to add organizer" }
  }
}

export async function updateOrganizerAction(organizerId: string, name: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("organizers").update({ name }).eq("id", organizerId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Organizer updated successfully", { organizerId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error updating organizer", error)
    return { error: error.message || "Failed to update organizer" }
  }
}

export async function deleteOrganizerAction(organizerId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("organizers").delete().eq("id", organizerId)

    if (error) throw error

    revalidatePath("/admin")
    logger.info("actions/entities", "Organizer deleted successfully", { organizerId })
    return { success: true }
  } catch (error: any) {
    logger.error("actions/entities", "Error deleting organizer", error)
    return { error: error.message || "Failed to delete organizer" }
  }
}
