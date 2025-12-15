import { PlayersGrid } from "@/components/players-grid"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import Link from "next/link"
import type { Person } from "@/lib/types"
import { apiFetch } from "@/lib/apiClient"

export const revalidate = 300

export default async function PlayersPage() {
  let players: Person[] = []

  try {
    // Call FastAPI backend
    const response = await apiFetch<any>("/api/people", {
      method: "GET",
    })

    console.log("[v0] /api/people raw response type:", typeof response)
    console.log("[v0] /api/people is array:", Array.isArray(response))
    console.log("[v0] /api/people has success:", 'success' in (response || {}))

    // Handle both formats:
    // 1. Direct array: [...]
    // 2. Wrapped: {success: true, data: [...]}
    let peopleData: any[] = []
    if (Array.isArray(response)) {
      peopleData = response
    } else if (response && response.success && Array.isArray(response.data)) {
      peopleData = response.data
    } else if (response && Array.isArray(response.data)) {
      peopleData = response.data
    }

    console.log("[v0] peopleData count:", peopleData.length)

    // Filter players: show_in_players_gallery=true AND has avatar
    const filteredPlayers = peopleData
      .filter((p: any) => p.show_in_players_gallery && p.avatar_url)
      .map((player: any) => ({
        ...player,
        _count: {
          photo_faces: player.faces_count || player.photo_count || 0,
        },
      }))

    console.log("[v0] filteredPlayers count:", filteredPlayers.length)

    // Get photo dates for each player from FastAPI
    for (const player of filteredPlayers) {
      try {
        const photosResponse = await apiFetch<any>(`/api/people/${player.id}/photos`, {
          method: "GET",
        })
        
        const photos = photosResponse.photos || photosResponse.data || []
        
        let mostRecentDate: string | null = null
        if (photos.length > 0) {
          const dates = photos
            .map((p: any) => p.gallery_shoot_date)
            .filter((date: any) => date != null)
          
          if (dates.length > 0) {
            mostRecentDate = dates.sort((a: string, b: string) => b.localeCompare(a))[0]
          }
        }
        
        player._mostRecentGalleryDate = mostRecentDate
        player._count.photo_faces = photos.length
      } catch (e) {
        console.error(`[v0] Error fetching photos for player ${player.id}:`, e)
        player._mostRecentGalleryDate = null
      }
    }

    // Sort by most recent gallery date (descending), then by name
    players = filteredPlayers.sort((a: any, b: any) => {
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
