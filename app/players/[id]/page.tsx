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
          galleries!inner (
            id,
            title,
            shoot_date
          )
        )
      `
      )
      .eq("person_id", personId)
      .or("verified.eq.true,confidence.gte.80")
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

export default async function PlayerGalleryPage({ params }: PlayerGalleryPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: player, error: playerError } = await supabase.from("people").select("*").eq("id", id).single()

  if (playerError || !player) {
    notFound()
  }

  // С ПАГИНАЦИЕЙ: загружаем все фото игрока
  const photoFaces = await loadPlayerPhotoFaces(supabase, id)

  const images: any[] =
    photoFaces?.map((face: any) => ({
      ...face.gallery_images,
      gallery: face.gallery_images.galleries,
    })) || []

  images.sort((a, b) => {
    const dateA = new Date(a.gallery?.shoot_date || 0).getTime()
    const dateB = new Date(b.gallery?.shoot_date || 0).getTime()

    if (dateA !== dateB) {
      return dateB - dateA
    }

    return (b.original_filename || "").localeCompare(a.original_filename || "")
  })

  return <PlayerGalleryView player={player as Person} images={images} />
}
