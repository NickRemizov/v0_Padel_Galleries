import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AuthButton } from "@/components/auth-button"
import { MainNav } from "@/components/main-nav"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get("telegram_user")

  if (!userCookie) {
    redirect("/")
  }

  let user: { id: string; person_id: string | null; first_name: string; username: string }
  try {
    user = JSON.parse(userCookie.value)
  } catch {
    redirect("/")
  }

  // Get person data if linked
  let person = null
  if (user.person_id) {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from("people")
      .select("*")
      .eq("id", user.person_id)
      .single()
    person = data
  }

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

          <div className="bg-card rounded-lg border p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Профиль</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Имя в Telegram</label>
                <p className="font-medium">{user.first_name}</p>
              </div>

              {user.username && (
                <div>
                  <label className="text-sm text-muted-foreground">Username</label>
                  <p className="font-medium">@{user.username}</p>
                </div>
              )}

              {person && (
                <>
                  <hr className="my-4" />
                  <div>
                    <label className="text-sm text-muted-foreground">Имя на сайте</label>
                    <p className="font-medium">{person.real_name}</p>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground">Показывать в галерее игроков</label>
                    <p className="font-medium">{person.show_in_players_gallery ? "Да" : "Нет"}</p>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground">Показывать фото в галереях</label>
                    <p className="font-medium">{person.show_photos_in_galleries ? "Да" : "Нет"}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="text-center text-muted-foreground text-sm">
            Редактирование настроек будет доступно в ближайшее время
          </p>
        </div>
      </div>
    </main>
  )
}
