/**
 * Home Page
 * 
 * @migrated 2025-12-27 - Uses apiFetch (FastAPI) instead of direct Supabase
 */

import { apiFetch } from "@/lib/apiClient"
import { GalleryGrid } from "@/components/gallery-grid"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import type { Gallery } from "@/lib/types"

// Force dynamic rendering - don't try to fetch during build
export const dynamic = "force-dynamic"

export default async function HomePage() {
  // Fetch galleries from FastAPI
  const result = await apiFetch("/api/galleries")

  if (!result.success) {
    return (
      <main className="min-h-screen bg-background border-background">
        <div className="mx-auto py-12 shadow-none">
          <header className="mb-12 text-center px-4">
            <h1 className="mb-4 font-serif font-bold tracking-tight text-foreground text-8xl">Padel in Valencia</h1>
            <p className="text-muted-foreground">
              {result.error || "Failed to load galleries. Please try again later."}
            </p>
          </header>
        </div>
      </main>
    )
  }

  const galleries = result.data || []

  return (
    <main className="min-h-screen bg-background border-background">
      <div className="mx-auto py-12 shadow-none">
        <header className="mb-12 text-center relative px-4">
          <div className="absolute right-0 top-0">
            <AuthButton />
          </div>
          <h1 className="mb-4 font-serif font-bold tracking-tight text-foreground text-8xl">Padel in Valencia</h1>
          <MainNav />
        </header>

        <GalleryGrid galleries={(galleries as Gallery[]) || []} />
      </div>
    </main>
  )
}
