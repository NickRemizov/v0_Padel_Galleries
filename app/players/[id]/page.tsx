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

  // Get player from FastAPI
  const playerResponse = await apiFetch<any>(`/api/people/${id}`, {
    method: "GET",
  })

  // Handle response format
  const player = playerResponse.success !== undefined 
    ? (playerResponse.success ? playerResponse.data || playerResponse : null)
    : playerResponse

  if (!player || playerResponse.error) {
    notFound()
  }

  // Get player photos from FastAPI
  const photosResponse = await apiFetch<any>(`/api/people/${id}/photos`, {
    method: "GET",
  })

  console.log("[v0] /api/people/{id}/photos response:", JSON.stringify(photosResponse, null, 2).slice(0, 500))

  // Extract photos from response
  const photos = photosResponse.photos || photosResponse.data || []

  // Transform photos to expected format
  const images: any[] = photos.map((photo: any) => ({
    id: photo.id,
    image_url: photo.image_url,
    original_url: photo.original_url,
    original_filename: photo.original_filename,
    file_size: photo.file_size,
    width: photo.width,
    height: photo.height,
    gallery_id: photo.gallery_id,
    created_at: photo.created_at,
    gallery: {
      id: photo.gallery_id,
      title: photo.gallery_title,
      shoot_date: photo.gallery_shoot_date,
      sort_order: photo.sort_order || "filename",
    },
  }))

  // Group images by gallery
  const galleryMap = new Map<string, any[]>()
  for (const img of images) {
    const galleryId = img.gallery_id
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
