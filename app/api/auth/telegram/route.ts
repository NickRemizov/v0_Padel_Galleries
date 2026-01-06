import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"
import { verifyTelegramAuth, isTelegramAuthDataValid } from "@/lib/telegram-auth"

/**
 * Telegram Login - proxy to FastAPI backend
 *
 * Frontend verification is kept for quick rejection of invalid requests,
 * but the actual auth logic is in FastAPI.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = body

    // Quick frontend verification (FastAPI also verifies)
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (botToken) {
      const authData: Record<string, string> = { id: String(id), first_name, auth_date: String(auth_date), hash }
      if (last_name) authData.last_name = last_name
      if (username) authData.username = username
      if (photo_url) authData.photo_url = photo_url

      if (!verifyTelegramAuth(authData, botToken)) {
        return NextResponse.json({ error: "Invalid authentication data" }, { status: 401 })
      }

      if (!isTelegramAuthDataValid(auth_date)) {
        return NextResponse.json({ error: "Authentication data expired" }, { status: 401 })
      }
    }

    // Call FastAPI backend
    const result = await apiFetch("/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({
        id,
        first_name,
        last_name,
        username,
        photo_url,
        auth_date,
        hash,
      }),
    })

    if (!result.success) {
      console.error("[telegram-auth] FastAPI error:", result.error)
      return NextResponse.json(
        { error: result.error || "Authentication failed" },
        { status: 401 }
      )
    }

    const { user } = result.data

    // Create session cookie
    const response = NextResponse.json({ user })
    response.cookies.set("telegram_user", JSON.stringify(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    })

    return response
  } catch (error) {
    console.error("[telegram-auth] Error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
