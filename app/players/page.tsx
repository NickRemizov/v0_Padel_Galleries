import { PlayersGrid } from "@/components/players-grid"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import Link from "next/link"
import type { Person } from "@/lib/types"
import { apiFetch } from "@/lib/apiClient"

// Force dynamic rendering - don't try to fetch during build
export const dynamic = "force-dynamic"
export const revalidate = 300

export default async function PlayersPage() {
  let players: Person[] = []

  try {
    // Call FastAPI backend with for_gallery=true for optimized response
    // Returns photo_count and most_recent_gallery_date in ONE request (no N+1!)
    const response = await apiFetch<any>("/api/people?for_gallery=true", {
      method: "GET",
    })

    // Unified API response format: {success, data, error, code}
    if (!response.success || !Array.isArray(response.data)) {
      console.error("[v0] Failed to fetch players:", response.error)
      return renderPage([])
    }

    // Filter players: show_in_players_gallery=true AND has avatar
    // Map to expected format with _count and _mostRecentGalleryDate
    const filteredPlayers = response.data
      .filter((p: any) => p.show_in_players_gallery && p.avatar_url)
      .map((player: any) => ({
        ...player,
        _count: {
          photo_faces: player.photo_count || 0,
        },
        _mostRecentGalleryDate: player.most_recent_gallery_date || null,
      }))

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

  return renderPage(players)
}

function renderPage(players: Person[]) {
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
