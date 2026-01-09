import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/env"

/**
 * POST /api/user/selfie-search
 * Search for user's photos using selfie face recognition.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate telegram_user cookie
    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let user: { id: string }
    try {
      user = JSON.parse(userCookie.value)
    } catch {
      return NextResponse.json({ error: "Invalid user cookie" }, { status: 401 })
    }

    // Get request body
    const body = await request.json()

    // Forward to Python API
    const response = await fetch(
      `${env.FASTAPI_URL}/api/user/selfie-search?user_id=${user.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error("[selfie-search] Python API error:", result)
      return NextResponse.json(
        { error: result.detail || "Search failed" },
        { status: response.status }
      )
    }

    console.log(`[selfie-search] Search completed for user ${user.id}`)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[selfie-search] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
