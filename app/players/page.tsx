import { createClient } from "@/lib/supabase/server"
import { PlayersGrid } from "@/components/players-grid"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import Link from "next/link"
import type { Person } from "@/lib/types"
import { apiFetch } from "@/lib/apiClient"

export const revalidate = 300

/**
 * Helper: загрузить photo_faces для списка игроков с пагинацией
 */
async function loadPhotoFacesForPlayers(supabase: any, playerIds: string[]) {
  if (playerIds.length === 0) return []

  let allFaces: any[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data: batch } = await supabase
      .from("photo_faces")
      .select(
        `
        person_id,
        gallery_images!inner (
          galleries!inner (
            shoot_date
          )
        )
      `
      )
      .in("person_id", playerIds)
      .range(offset, offset + pageSize - 1)

    if (!batch || batch.length === 0) break
    allFaces = allFaces.concat(batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return allFaces
}

export default async function PlayersPage() {
  let players: Person[] = []

  try {
    const response = await apiFetch<any[]>("/people", {
      method: "GET",
    })

    // apiFetch returns {success, data} format
    const peopleData = response.success && response.data ? response.data : (Array.isArray(response) ? response : [])

    // Filter and sort players
    const filteredPlayers = peopleData
      .filter((p: any) => p.show_in_players_gallery && p.avatar_url)
      .map((player: any) => ({
        ...player,
        // Keep _count for backward compatibility with existing code
        _count: {
          photo_faces: player.verified_photos_count || 0,
        },
      }))

    // Fetch most recent gallery date for each player (still need this from Supabase)
    // This is read-only metadata that doesn't affect business logic
    const supabase = await createClient()

    // С ПАГИНАЦИЕЙ: загружаем photo_faces для всех игроков
    const photoFaces = await loadPhotoFacesForPlayers(
      supabase,
      filteredPlayers.map((p) => p.id)
    )

    // Add most recent gallery date to each player
    players = filteredPlayers.map((player: any) => {
      const playerPhotoFaces = photoFaces.filter((pf: any) => pf.person_id === player.id)

      let mostRecentDate: string | null = null
      if (playerPhotoFaces.length > 0) {
        const dates = playerPhotoFaces
          .map((pf: any) => pf.gallery_images?.galleries?.shoot_date)
          .filter((date: any) => date != null)

        if (dates.length > 0) {
          mostRecentDate = dates.sort((a: string, b: string) => b.localeCompare(a))[0]
        }
      }

      return {
        ...player,
        _mostRecentGalleryDate: mostRecentDate,
      }
    })

    // Sort by most recent gallery date (descending), then by name
    players.sort((a: any, b: any) => {
      if (!a._mostRecentGalleryDate && !b._mostRecentGalleryDate) {
        return a.real_name.localeCompare(b.real_name)
      }
      if (!a._mostRecentGalleryDate) return 1
      if (!b._mostRecentGalleryDate) return -1

      const dateCompare = b._mostRecentGalleryDate.localeCompare(a._mostRecentGalleryDate)
      if (dateCompare !== 0) return dateCompare

      return a.real_name.localeCompare(b.real_name)
    })
  } catch (error) {
    console.error("[v0] Error fetching players:", error)
  }

  return (
    <main className="min-h-screen bg-background border-background">
      <div className="mx-auto py-12 shadow-none">
        <header className="mb-12 text-center relative px-4">
          <div className="absolute right-0 top-0">
            <AuthButton />
          </div>
          <Link href="/" className="inline-block mb-4 hover:opacity-80 transition-opacity">
            <h1 className="font-serif font-bold tracking-tight text-foreground text-8xl">Padel in Valencia</h1>
          </Link>
          <MainNav />
        </header>

        <PlayersGrid players={players} />
      </div>
    </main>
  )
}
