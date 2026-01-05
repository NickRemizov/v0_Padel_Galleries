import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import { Button } from "@/components/ui/button"
import { ActivityFeed } from "@/components/activity-feed"

export const dynamic = "force-dynamic"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.vlcpadel.com"

interface Activity {
  type: string
  created_at: string
  image_id?: string
  gallery_id?: string
  metadata?: Record<string, any>
}

async function fetchActivity(personId: string, userId: string): Promise<Activity[]> {
  try {
    const url = `${API_URL}/api/user/activity?person_id=${personId}&user_id=${userId}&limit=50`
    const response = await fetch(url, {
      cache: "no-store",
    })

    if (!response.ok) {
      console.error("[activity] API error:", response.status)
      return []
    }

    const data = await response.json()
    return data.data?.activities || []
  } catch (error) {
    console.error("[activity] Fetch error:", error)
    return []
  }
}

export default async function ActivityPage() {
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

  const activities = await fetchActivity(user.person_id, user.id)

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
          <h2 className="text-2xl font-bold mb-2">Активность</h2>
          <p className="text-muted-foreground">
            История ваших действий и уведомления
          </p>
        </div>

        {activities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg mb-4">
              Пока нет активности
            </p>
            <Link href="/">
              <Button>Перейти к галереям</Button>
            </Link>
          </div>
        ) : (
          <ActivityFeed activities={activities} />
        )}
      </div>
    </main>
  )
}
