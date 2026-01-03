"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { setToken } from "@/lib/admin-auth"
import { Loader2 } from "lucide-react"

export function OAuthCallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get("token")

    if (token) {
      // Save token to localStorage
      setToken(token)
      // Redirect to admin dashboard (remove token from URL)
      router.replace("/admin")
    }
  }, [searchParams, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Авторизация...</span>
      </div>
    </div>
  )
}
