"use server"

import { apiFetch } from "@/lib/apiClient"
import { revalidatePath } from "next/cache"

// ===== PEOPLE =====

export async function getPeopleAction(withStats = false) {
  return await apiFetch(`/api/people?with_stats=${withStats}`)
}

export async function getPersonAction(personId: string) {
  return await apiFetch(`/api/people/${personId}`)
}

export async function getPersonPhotosAction(personId: string) {
  return await apiFetch(`/api/people/${personId}/photos`)
}

export async function addPersonAction(data: {
  real_name: string
  telegram_name?: string
  telegram_nickname?: string
  telegram_profile_url?: string
  facebook_profile_url?: string
  instagram_profile_url?: string
  paddle_ranking?: number
  avatar_url?: string
  show_in_players_gallery?: boolean
  show_photos_in_galleries?: boolean
}) {
  const result = await apiFetch("/api/people", {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function updatePersonAction(personId: string, data: Record<string, any>) {
  const result = await apiFetch(`/api/people/${personId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function updatePersonAvatarAction(personId: string, avatarUrl: string) {
  const result = await apiFetch(`/api/people/${personId}/avatar?avatar_url=${encodeURIComponent(avatarUrl)}`, {
    method: "PATCH",
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function updatePersonVisibilityAction(
  personId: string,
  field: "show_in_players_gallery" | "show_photos_in_galleries",
  value: boolean,
) {
  const result = await apiFetch(`/api/people/${personId}/visibility`, {
    method: "PATCH",
    body: JSON.stringify({ [field]: value }),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function deletePersonAction(personId: string) {
  const result = await apiFetch(`/api/people/${personId}`, { method: "DELETE" })
  if (result.success) revalidatePath("/admin")
  return result
}

// ===== PHOTOGRAPHERS =====

export async function getPhotographersAction() {
  return await apiFetch("/api/photographers")
}

export async function addPhotographerAction(name: string) {
  const result = await apiFetch("/api/photographers", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function updatePhotographerAction(photographerId: string, name: string) {
  const result = await apiFetch(`/api/photographers/${photographerId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function deletePhotographerAction(photographerId: string) {
  const result = await apiFetch(`/api/photographers/${photographerId}`, { method: "DELETE" })
  if (result.success) revalidatePath("/admin")
  return result
}

// ===== LOCATIONS =====

export async function getLocationsAction() {
  return await apiFetch("/api/locations")
}

export async function addLocationAction(data: {
  name: string
  city_id?: string
  address?: string
  maps_url?: string
  website_url?: string
}) {
  const result = await apiFetch("/api/locations", {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function updateLocationAction(locationId: string, data: {
  name?: string
  city_id?: string | null
  address?: string | null
  maps_url?: string | null
  website_url?: string | null
}) {
  const result = await apiFetch(`/api/locations/${locationId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function deleteLocationAction(locationId: string) {
  const result = await apiFetch(`/api/locations/${locationId}`, { method: "DELETE" })
  if (result.success) revalidatePath("/admin")
  return result
}

// ===== ORGANIZERS =====

export async function getOrganizersAction() {
  return await apiFetch("/api/organizers")
}

export async function addOrganizerAction(name: string) {
  const result = await apiFetch("/api/organizers", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function updateOrganizerAction(organizerId: string, name: string) {
  const result = await apiFetch(`/api/organizers/${organizerId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  })
  if (result.success) revalidatePath("/admin")
  return result
}

export async function deleteOrganizerAction(organizerId: string) {
  const result = await apiFetch(`/api/organizers/${organizerId}`, { method: "DELETE" })
  if (result.success) revalidatePath("/admin")
  return result
}
