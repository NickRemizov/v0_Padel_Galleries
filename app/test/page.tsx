import { apiFetch } from "@/lib/apiClient"
import { TestPlayerCard } from "./TestPlayerCard"

export const revalidate = 0 // No caching for test page

const PLAYER_SLUG = "sintez_d"
const PLAYER_ID = "dbaf820e-ab2a-4b1c-955d-690134b69142"

export default async function TestPage() {
  // Get player data
  const playerResponse = await apiFetch<any>(`/api/people/${PLAYER_SLUG}`)
  const player = playerResponse.data

  // Get player photos
  const photosResponse = await apiFetch<any>(`/api/people/${PLAYER_ID}/photos`)
  const rawPhotos = photosResponse.success ? (photosResponse.data || []) : []

  // Transform photos
  const photos = rawPhotos.map((face: any) => {
    const gi = face.gallery_images || {}
    const gallery = gi.galleries || {}
    return {
      id: gi.id || face.photo_id,
      slug: gi.slug,
      image_url: gi.image_url,
      width: gi.width || 1200,
      height: gi.height || 800,
      gallery_id: gi.gallery_id,
      gallery_title: gallery.title,
    }
  })

  // Count unique galleries
  const galleryIds = new Set(photos.map((p: any) => p.gallery_id).filter(Boolean))

  return (
    <TestPlayerCard
      player={player}
      photos={photos}
      stats={{
        level: "3.25",
        tournaments: 7,
        photosCount: photos.length,
        galleriesCount: galleryIds.size,
      }}
    />
  )
}
