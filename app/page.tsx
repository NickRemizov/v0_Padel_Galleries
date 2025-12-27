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

export const revalidate = 60

export default async function HomePage() {
  // Fetch galleries from FastAPI
  const result = await apiFetch("/api/galleries")

  if (!result.success) {
    return (
      &lt;main className="min-h-screen bg-background border-background"&gt;
        &lt;div className="mx-auto py-12 shadow-none"&gt;
          &lt;header className="mb-12 text-center px-4"&gt;
            &lt;h1 className="mb-4 font-serif font-bold tracking-tight text-foreground text-8xl"&gt;Padel in Valencia&lt;/h1&gt;
            &lt;p className="text-muted-foreground"&gt;
              {result.error || "Failed to load galleries. Please try again later."}
            &lt;/p&gt;
          &lt;/header&gt;
        &lt;/div&gt;
      &lt;/main&gt;
    )
  }

  const galleries = result.data || []

  return (
    &lt;main className="min-h-screen bg-background border-background"&gt;
      &lt;div className="mx-auto py-12 shadow-none"&gt;
        &lt;header className="mb-12 text-center relative px-4"&gt;
          &lt;div className="absolute right-0 top-0"&gt;
            &lt;AuthButton /&gt;
          &lt;/div&gt;
          &lt;h1 className="mb-4 font-serif font-bold tracking-tight text-foreground text-8xl"&gt;Padel in Valencia&lt;/h1&gt;
          &lt;MainNav /&gt;
        &lt;/header&gt;

        &lt;GalleryGrid galleries={(galleries as Gallery[]) || []} /&gt;
      &lt;/div&gt;
    &lt;/main&gt;
  )
}
