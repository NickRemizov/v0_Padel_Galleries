import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/env"

/**
 * GET /api/user/welcome
 * Check if welcome message should be shown to current user.
 */
export async function GET(request: NextRequest) {
  try {
    // Get user from cookie
    const userCookie = request.cookies.get("telegram_user")

    if (!userCookie) {
      return NextResponse.json({
        success: true,
        data: { show: false, reason: "not_authenticated" }
      })
    }

    let user: { id: string }
    try {
      user = JSON.parse(userCookie.value)
    } catch {
      return NextResponse.json({
        success: true,
        data: { show: false, reason: "invalid_cookie" }
      })
    }

    // Get lang from query params
    const lang = request.nextUrl.searchParams.get("lang") || "en"

    // Forward to FastAPI with user info
    const response = await fetch(`${env.FASTAPI_URL}/api/user/welcome?lang=${lang}`, {
      headers: {
        "X-User-Id": user.id,
        "Content-Type": "application/json",
      },
    })

    const result = await response.json()
    return NextResponse.json(result)
  } catch (error) {
    console.error("[user/welcome] Error:", error)
    return NextResponse.json({
      success: true,
      data: { show: false, reason: "error" }
    })
  }
}
