import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

/**
 * Settings API - proxy to FastAPI backend
 */

// PUT /api/settings - Update current user's profile
export async function PUT(request: NextRequest) {
  try {
    // Get user from cookie
    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)
    if (!user.person_id) {
      return NextResponse.json({ error: "No person linked to user" }, { status: 400 })
    }

    const body = await request.json()

    // Call FastAPI backend
    const result = await apiFetch(`/api/user/profile/${user.person_id}?user_id=${user.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    })

    if (!result.success) {
      console.error("[settings] FastAPI error:", result.error)
      return NextResponse.json(
        { error: result.error || "Failed to update profile" },
        { status: 400 }
      )
    }

    console.log(`[settings] User ${user.id} updated profile via FastAPI`)

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    console.error("[settings] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
