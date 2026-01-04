import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import { Button } from "@/components/ui/button"
import { createServiceClient } from "@/lib/supabase/service"
import { MyPhotosGrid } from "@/components/my-photos-grid"

export const dynamic = "force-dynamic"

export default async function MyPhotosPage() {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get("telegram_user")

  if (!userCookie) {
    redirect("/")
  }

  let user: { id: string; person_id: string | null }
  try {
    user = JSON.parse(userCookie.value)
  } catch {
    redirect("/")
  }

  if (!user.person_id) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          <header className="mb-12 relative">
            <div className="absolute right-0 top-0">
              <AuthButton />
            </div>
            <Link href="/" className="inline-block mb-4 hover:opacity-80 transition-opacity">
              <h1 className="text-center font-serif font-bold tracking-tight text-foreground text-6xl">
                Padel in Valencia
              </h1>
            </Link>
            <MainNav />
          </header>

          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg mb-4">
              Ваш профиль ещё не связан с игроком. Перезайдите на сайт.
            </p>
            <Link href="/">
              <Button>На главную</Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const supabase = createServiceClient()

  // Get all photos where this person is tagged
  const { data: photoFaces, error } = await supabase
    .from("photo_faces")
    .select(`
      id,
      photo_id,
      person_id,
      recognition_confidence,
      verified,
      hidden_by_user,
      insightface_bbox,
      gallery_images!photo_id (
        id,
        slug,
        gallery_id,
        image_url,
        original_url,
        galleries (
          id,
          slug,
          title
        )
      )
    `)
    .eq("person_id", user.person_id)
    .order("verified", { ascending: true })  // Unverified first
    .order("recognition_confidence", { ascending: true })  // Low confidence first

  if (error) {
    console.error("[v0] Error fetching my photos:", error)
  }

  // Get faces count for each photo (all people, not just current user)
  let facesCountByPhoto: Record<string, number> = {}
  if (photoFaces && photoFaces.length > 0) {
    const photoIds = [...new Set(photoFaces.map(pf => pf.photo_id))]

    // Count all faces on these photos (with person_id, not null)
    const { data: allFaces } = await supabase
      .from("photo_faces")
      .select("photo_id")
      .in("photo_id", photoIds)
      .not("person_id", "is", null)

    if (allFaces) {
      facesCountByPhoto = allFaces.reduce((acc, face) => {
        acc[face.photo_id] = (acc[face.photo_id] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }
  }

  // Add faces_count to each photo face
  const photoFacesWithCount = photoFaces?.map(pf => ({
    ...pf,
    faces_count: facesCountByPhoto[pf.photo_id] || 1
  })) || []

  // Count stats
  const totalPhotos = photoFacesWithCount.length
  const verifiedPhotos = photoFacesWithCount.filter(pf => pf.verified).length
  const hiddenPhotos = photoFacesWithCount.filter(pf => pf.hidden_by_user).length

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12">
        <header className="mb-12 relative">
          <div className="absolute right-0 top-0">
            <AuthButton />
          </div>
          <Link href="/" className="inline-block mb-4 hover:opacity-80 transition-opacity">
            <h1 className="text-center font-serif font-bold tracking-tight text-foreground text-6xl">
              Padel in Valencia
            </h1>
          </Link>
          <MainNav />
        </header>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Мои фотографии</h2>
          <p className="text-muted-foreground">
            Всего: {totalPhotos} | Подтверждённых: {verifiedPhotos} | Скрытых: {hiddenPhotos}
          </p>
        </div>

        {photoFacesWithCount.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg mb-4">
              Пока нет фотографий с вами
            </p>
            <Link href="/">
              <Button>Перейти к галереям</Button>
            </Link>
          </div>
        ) : (
          <MyPhotosGrid photoFaces={photoFacesWithCount} personId={user.person_id} />
        )}
      </div>
    </main>
  )
}
