import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

/**
 * Google Login - proxy to FastAPI backend
 *
 * Receives Google ID Token from frontend, passes to FastAPI for verification
 * and user creation/lookup.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { credential, access_token } = body

    if (!credential && !access_token) {
      return NextResponse.json({ error: "Missing credential or access_token" }, { status: 400 })
    }

    // Call FastAPI backend
    const result = await apiFetch("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential, access_token }),
    })

    if (!result.success) {
      console.error("[google-auth] FastAPI error:", result.error)
      return NextResponse.json(
        { error: result.error || "Authentication failed" },
        { status: 401 }
      )
    }

    const { user } = result.data

    // Create session cookie (same as Telegram auth)
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
    console.error("[google-auth] Error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
