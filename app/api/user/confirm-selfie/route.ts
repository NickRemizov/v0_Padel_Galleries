import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/env"

/**
 * POST /api/user/confirm-selfie
 * Confirm selfie matches and create person.
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
      `${env.FASTAPI_URL}/api/user/confirm-selfie?user_id=${user.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error("[confirm-selfie] Python API error:", result)
      return NextResponse.json(
        { error: result.detail || "Confirmation failed" },
        { status: response.status }
      )
    }

    console.log(`[confirm-selfie] Confirmed for user ${user.id}, person created`)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[confirm-selfie] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
