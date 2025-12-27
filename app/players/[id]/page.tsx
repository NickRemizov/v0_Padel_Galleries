import { notFound } from "next/navigation"
import { PlayerGalleryView } from "@/components/player-gallery-view"
import type { Person } from "@/lib/types"
import { apiFetch } from "@/lib/apiClient"

interface PlayerGalleryPageProps {
  params: Promise<{ id: string }>
}

export const revalidate = 300

/**
 * Sort images by gallery sort_order setting
 */
function sortByGalleryOrder(images: any[], sortOrder: string): any[] {
  switch (sortOrder) {
    case "filename":
      return images.sort((a, b) => (a.original_filename || "").localeCompare(b.original_filename || ""))
    case "created":
    case "added":
      return images.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    default:
      return images.sort((a, b) => (a.original_filename || "").localeCompare(b.original_filename || ""))
  }
}

export default async function PlayerGalleryPage({ params }: PlayerGalleryPageProps) {
  const { id } = await params

  // Get player from FastAPI - unified format: {success, data, error, code}
  const playerResponse = await apiFetch<any>(`/api/people/${id}`, {
    method: "GET",
  })

  if (!playerResponse.success || !playerResponse.data) {
    notFound()
  }

  const player = playerResponse.data

  // Get player photos from FastAPI - unified format
  const photosResponse = await apiFetch<any>(`/api/people/${id}/photos`, {
    method: "GET",
  })

  // Extract photos from response
  // Each item has nested gallery_images object with galleries inside
  const rawPhotos = photosResponse.success ? (photosResponse.data || []) : []

  // Transform photos to expected format
  // API format: { id, photo_id, gallery_images: { id, image_url, gallery_id, original_filename, galleries: { title, shoot_date, sort_order } } }
  const images: any[] = rawPhotos.map((face: any) => {
    const gi = face.gallery_images || {}
    const gallery = gi.galleries || {}
    return {
      id: gi.id || face.photo_id,
      image_url: gi.image_url,
      original_url: gi.original_url || gi.image_url,
      original_filename: gi.original_filename,
      file_size: gi.file_size,
      width: gi.width,
      height: gi.height,
      gallery_id: gi.gallery_id,
      created_at: gi.created_at,
      gallery: {
        id: gi.gallery_id || gallery.id,
        title: gallery.title,
        shoot_date: gallery.shoot_date,
        sort_order: gallery.sort_order || "filename",
      },
    }
  })

  // Group images by gallery
  const galleryMap = new Map<string, any[]>()
  for (const img of images) {
    const galleryId = img.gallery_id
    if (!galleryId) continue
    if (!galleryMap.has(galleryId)) {
      galleryMap.set(galleryId, [])
    }
    galleryMap.get(galleryId)!.push(img)
  }

  // Sort galleries by shoot_date (newest first)
  const sortedGalleries = Array.from(galleryMap.entries()).sort((a, b) => {
    const dateA = new Date(a[1][0]?.gallery?.shoot_date || 0).getTime()
    const dateB = new Date(b[1][0]?.gallery?.shoot_date || 0).getTime()
    return dateB - dateA
  })

  // Sort images within each gallery according to gallery's sort_order
  const sortedImages: any[] = []
  for (const [galleryId, galleryImages] of sortedGalleries) {
    const sortOrder = galleryImages[0]?.gallery?.sort_order || "filename"
    const sorted = sortByGalleryOrder([...galleryImages], sortOrder)
    sortedImages.push(...sorted)
  }

  return <PlayerGalleryView player={player as Person} images={sortedImages} />
}
