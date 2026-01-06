import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import { SettingsForm } from "@/components/settings-form"
import { apiFetch } from "@/lib/apiClient"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get("telegram_user")

  if (!userCookie) {
    redirect("/")
  }

  let user: {
    id: string
    person_id: string | null
    first_name: string
    username: string
    photo_url: string | null
    telegram_id?: number
    google_id?: string
    email?: string
  }
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
          </div>
        </div>
      </main>
    )
  }

  // Get person data from FastAPI
  const result = await apiFetch(`/api/user/profile/${user.person_id}`)

  if (!result.success || !result.data) {
    redirect("/")
  }

  const person = result.data

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

        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Настройки</h2>

          <SettingsForm
            person={person}
            telegramName={user.first_name}
            telegramUsername={user.username}
            telegramPhotoUrl={user.photo_url}
            hasTelegramAuth={!!user.telegram_id}
            hasGoogleAuth={!!user.google_id}
            googleEmail={user.email}
          />
        </div>
      </div>
    </main>
  )
}
