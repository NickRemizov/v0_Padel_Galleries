import type { PersonPhoto } from "../types"

/**
 * Sort images by gallery sort_order setting
 */
export function sortByGalleryOrder(images: PersonPhoto[], sortOrder: string): PersonPhoto[] {
  const sorted = [...images]
  switch (sortOrder) {
    case "filename":
      return sorted.sort((a, b) => (a.filename || "").localeCompare(b.filename || ""))
    case "created":
    case "added":
      return sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    default:
      return sorted.sort((a, b) => (a.filename || "").localeCompare(b.filename || ""))
  }
}

/**
 * Sort photos by gallery date then by gallery sort order
 * Optionally move unverified photos to the beginning
 */
export function sortPhotos(photos: PersonPhoto[], showUnverifiedFirst: boolean): PersonPhoto[] {
  // Group photos by gallery
  const galleryMap = new Map<string, PersonPhoto[]>()
  for (const photo of photos) {
    const galleryId = photo.gallery_id
    if (!galleryMap.has(galleryId)) {
      galleryMap.set(galleryId, [])
    }
    galleryMap.get(galleryId)!.push(photo)
  }

  // Sort galleries by shoot_date (newest first)
  const sortedGalleries = Array.from(galleryMap.entries()).sort((a, b) => {
    const dateA = new Date(a[1][0]?.shootDate || 0).getTime()
    const dateB = new Date(b[1][0]?.shootDate || 0).getTime()
    return dateB - dateA
  })

  // Sort images within each gallery according to gallery's sort_order
  let result: PersonPhoto[] = []
  for (const [, galleryPhotos] of sortedGalleries) {
    const sortOrder = galleryPhotos[0]?.sort_order || "filename"
    const sorted = sortByGalleryOrder(galleryPhotos, sortOrder)
    result.push(...sorted)
  }

  // If showUnverifiedFirst is enabled, move unverified photos to the beginning
  if (showUnverifiedFirst) {
    const unverified = result.filter((p) => !p.verified)
    const verified = result.filter((p) => p.verified)
    return [...unverified, ...verified]
  }

  return result
}

/**
 * Format date to DD.MM format
 */
export function formatShortDate(dateString: string | null): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}`
}
