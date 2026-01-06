import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

// POST /api/my-photos/[photoFaceId]/unhide - Show photo in public galleries again
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ photoFaceId: string }> }
) {
  try {
    const { photoFaceId } = await params

    // Get user from cookie
    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)
    if (!user.person_id) {
      return NextResponse.json({ error: "No person linked to user" }, { status: 400 })
    }

    // Call FastAPI
    const result = await apiFetch(
      `/api/user/photo-faces/${photoFaceId}/unhide?person_id=${user.person_id}&user_id=${user.id}`,
      { method: "POST" }
    )

    if (!result.success) {
      console.error("[my-photos] FastAPI error:", result.error)
      return NextResponse.json(
        { error: result.error || "Failed to unhide" },
        { status: 400 }
      )
    }

    console.log(`[my-photos] User ${user.id} unhid photo_face ${photoFaceId} via FastAPI`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[my-photos] Error in unhide endpoint:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
