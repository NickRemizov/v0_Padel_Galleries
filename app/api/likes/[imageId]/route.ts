import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

// Get likes for an image
export async function GET(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    // Get user_id from cookie if available
    let userId: string | undefined
    const userCookie = request.cookies.get("telegram_user")
    if (userCookie) {
      try {
        const user = JSON.parse(userCookie.value)
        userId = user.id
      } catch {
        // Ignore parse errors
      }
    }

    const url = userId
      ? `/api/user/images/${imageId}/likes?user_id=${userId}`
      : `/api/user/images/${imageId}/likes`

    const result = await apiFetch(url)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[likes] Error fetching likes:", error)
    return NextResponse.json({ error: "Failed to fetch likes" }, { status: 500 })
  }
}

// Toggle like for an image
export async function POST(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)

    const result = await apiFetch(
      `/api/user/images/${imageId}/likes/toggle?user_id=${user.id}`,
      { method: "POST" }
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[likes] Error toggling like:", error)
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 })
  }
}
