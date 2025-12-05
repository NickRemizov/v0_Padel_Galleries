import { createClient } from "@/lib/supabase/server"
import { GalleryGrid } from "@/components/gallery-grid"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import type { Gallery } from "@/lib/types"

export const revalidate = 60

export default async function HomePage() {
  const supabase = await createClient()

  if (!supabase) {
    return (
      <main className="min-h-screen bg-background border-background">
        <div className="mx-auto py-12 shadow-none">
          <header className="mb-12 text-center px-4">
            <h1 className="mb-4 font-serif font-bold tracking-tight text-foreground text-8xl">Padel in Valencia</h1>
            <p className="text-muted-foreground">
              Supabase configuration is missing. Please check environment variables.
            </p>
          </header>
        </div>
      </main>
    )
  }

  const { data: galleries, error } = await supabase
    .from("galleries")
    .select(
      `
      *,
      photographers (
        id,
        name
      ),
      locations (
        id,
        name
      ),
      organizers (
        id,
        name
      )
    `,
    )
    .order("shoot_date", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching galleries:", error)
    console.error("[v0] Error details:", JSON.stringify(error, null, 2))
  }

  const galleriesWithCount = await Promise.all(
    (galleries || []).map(async (gallery: any) => {
      const { count } = await supabase
        .from("gallery_images")
        .select("*", { count: "exact", head: true })
        .eq("gallery_id", gallery.id)

      return {
        ...gallery,
        _count: {
          gallery_images: count || 0,
        },
      }
    }),
  )

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

        <GalleryGrid galleries={(galleriesWithCount as Gallery[]) || []} />
      </div>
    </main>
  )
}
