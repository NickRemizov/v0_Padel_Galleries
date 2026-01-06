import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import { Button } from "@/components/ui/button"
import { MyPhotosGrid } from "@/components/my-photos-grid"
import { apiFetch } from "@/lib/apiClient"

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

  // Get photos from FastAPI
  const result = await apiFetch(`/api/user/my-photos?person_id=${user.person_id}`)

  const photoFacesWithCount = result.success ? (result.data?.photo_faces || []) : []

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

        {photoFacesWithCount.length === 0 ? (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Мои фотографии</h2>
              <p className="text-muted-foreground">Всего: 0</p>
            </div>
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg mb-4">
                Пока нет фотографий с вами
              </p>
              <Link href="/">
                <Button>Перейти к галереям</Button>
              </Link>
            </div>
          </>
        ) : (
          <MyPhotosGrid photoFaces={photoFacesWithCount} personId={user.person_id} />
        )}
      </div>
    </main>
  )
}
