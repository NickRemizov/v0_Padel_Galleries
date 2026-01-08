import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/env"

/**
 * POST /api/user/welcome/seen
 * Mark welcome message as seen for current user.
 */
export async function POST(request: NextRequest) {
  try {
    // Get user from cookie
    const userCookie = request.cookies.get("telegram_user")

    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let user: { id: string }
    try {
      user = JSON.parse(userCookie.value)
    } catch {
      return NextResponse.json({ error: "Invalid cookie" }, { status: 401 })
    }

    // Forward to FastAPI with user info
    const response = await fetch(`${env.FASTAPI_URL}/api/user/welcome/seen`, {
      method: "POST",
      headers: {
        "X-User-Id": user.id,
        "Content-Type": "application/json",
      },
    })

    const result = await response.json()

    if (!response.ok) {
      return NextResponse.json(result, { status: response.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[user/welcome/seen] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
