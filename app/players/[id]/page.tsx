import { notFound, redirect } from "next/navigation"
import { PlayerGalleryView } from "@/components/player-gallery-view"
import type { Person } from "@/lib/types"
import { apiFetch } from "@/lib/apiClient"
import type { Metadata } from "next"

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ photo?: string }>
}

export const revalidate = 300

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params
  const { photo } = await searchParams

  const playerResponse = await apiFetch<any>(`/api/people/${id}`)
  if (!playerResponse.success || !playerResponse.data) {
    return { title: "Игрок не найден" }
  }

  const player = playerResponse.data
  let ogImage = player.avatar_url
  let title = `Фотографии ${player.real_name}`

  // If specific photo requested, get its URL
  if (photo) {
    const photosResponse = await apiFetch<any>(`/api/people/${id}/photos`)
    if (photosResponse.success && photosResponse.data) {
      const photoData = photosResponse.data.find((f: any) => f.gallery_images?.slug === photo)
      if (photoData?.gallery_images?.image_url) {
        ogImage = photoData.gallery_images.image_url
        title = `${player.real_name} - Фото`
      }
    }
  }

  const description = `Фотографии игрока ${player.real_name}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  }
}

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

export default async function PlayerGalleryPage({ params }: Props) {
  const { id } = await params

  // Get player from FastAPI - unified format: {success, data, error, code}
  const playerResponse = await apiFetch<any>(`/api/people/${id}`, {
    method: "GET",
  })

  if (!playerResponse.success || !playerResponse.data) {
    notFound()
  }

  const player = playerResponse.data

  // Privacy check: if personal gallery is disabled, redirect to players list
  // Cascading logic: show_name_on_photos=false also disables gallery
  if (!player.create_personal_gallery || !player.show_name_on_photos) {
    redirect("/players")
  }

  // Get player photos from FastAPI - unified format
  const photosResponse = await apiFetch<any>(`/api/people/${id}/photos`, {
    method: "GET",
  })

  // Extract photos from response
  // Each item has nested gallery_images object with galleries inside
  const rawPhotos = photosResponse.success ? (photosResponse.data || []) : []

  // Transform photos to expected format
  // API format: { id, photo_id, gallery_images: { id, slug, image_url, gallery_id, original_filename, galleries: { id, slug, title, shoot_date, sort_order } } }
  const images: any[] = rawPhotos.map((face: any) => {
    const gi = face.gallery_images || {}
    const gallery = gi.galleries || {}
    return {
      id: gi.id || face.photo_id,
      slug: gi.slug,
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
        slug: gallery.slug,
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
