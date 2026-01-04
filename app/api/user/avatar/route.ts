import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/env"

/**
 * POST /api/user/avatar
 * Update user's avatar from cropped image.
 *
 * Security: Validates telegram_user cookie and ensures user can only update their own avatar.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate telegram_user cookie
    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let user: { id: string; person_id: string | null }
    try {
      user = JSON.parse(userCookie.value)
    } catch {
      return NextResponse.json({ error: "Invalid user cookie" }, { status: 401 })
    }

    if (!user.person_id) {
      return NextResponse.json({ error: "No person linked to user" }, { status: 400 })
    }

    // Get FormData from request
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Check file size (2MB limit for avatar)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 })
    }

    // Forward to Python API with person_id
    const pythonFormData = new FormData()
    pythonFormData.append("person_id", user.person_id)
    pythonFormData.append("file", file)

    const response = await fetch(`${env.FASTAPI_URL}/api/user/avatar`, {
      method: "POST",
      body: pythonFormData,
    })

    const result = await response.json()

    if (!response.ok) {
      console.error("[user/avatar] Python API error:", result)
      return NextResponse.json(
        { error: result.detail || "Failed to update avatar" },
        { status: response.status }
      )
    }

    console.log(`[user/avatar] Updated avatar for user ${user.id} (person ${user.person_id})`)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[user/avatar] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
