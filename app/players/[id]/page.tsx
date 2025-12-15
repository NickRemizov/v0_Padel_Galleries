import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { PlayerGalleryView } from "@/components/player-gallery-view"
import type { Person } from "@/lib/types"

interface PlayerGalleryPageProps {
  params: Promise<{ id: string }>
}

export const revalidate = 300

/**
 * Helper: загрузить все photo_faces для игрока с пагинацией
 */
async function loadPlayerPhotoFaces(supabase: any, personId: string) {
  let allFaces: any[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data: batch, error } = await supabase
      .from("photo_faces")
      .select(
        `
        id,
        confidence,
        verified,
        gallery_images!inner (
          id,
          image_url,
          original_url,
          original_filename,
          file_size,
          width,
          height,
          gallery_id,
          created_at,
          galleries!inner (
            id,
            title,
            shoot_date,
            sort_order
          )
        )
      `
      )
      .eq("person_id", personId)
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("[v0] Error fetching player photos batch:", error)
      break
    }

    if (!batch || batch.length === 0) break
    allFaces = allFaces.concat(batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return allFaces
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

export default async function PlayerGalleryPage({ params }: PlayerGalleryPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: player, error: playerError } = await supabase.from("people").select("*").eq("id", id).single()

  if (playerError || !player) {
    notFound()
  }

  // С ПАГИНАЦИЕЙ: загружаем все фото игрока (без фильтра по verified/confidence)
  const photoFaces = await loadPlayerPhotoFaces(supabase, id)

  const images: any[] =
    photoFaces?.map((face: any) => ({
      ...face.gallery_images,
      gallery: face.gallery_images.galleries,
    })) || []

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
