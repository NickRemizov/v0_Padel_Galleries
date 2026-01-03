import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GoogleLoginButton } from "@/components/admin/google-login-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Ошибка авторизации Google. Попробуйте еще раз.",
  userinfo_failed: "Не удалось получить информацию профиля.",
  not_admin: "Ваш email не зарегистрирован как администратор.",
  inactive: "Ваш аккаунт деактивирован.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>
}) {
  const params = await searchParams
  const cookieStore = await cookies()

  // If token in URL, we're returning from OAuth - redirect to admin
  // The cookie was already set by backend
  if (params.token) {
    redirect("/admin")
  }

  // Check if already logged in
  const adminToken = cookieStore.get("admin_token")
  if (adminToken) {
    redirect("/admin")
  }

  const errorMessage = params.error ? ERROR_MESSAGES[params.error] || params.error : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Админ-панель</CardTitle>
          <CardDescription>
            Войдите через Google для управления галереями
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <GoogleLoginButton />
          <p className="text-xs text-center text-muted-foreground">
            Только для авторизованных администраторов
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
