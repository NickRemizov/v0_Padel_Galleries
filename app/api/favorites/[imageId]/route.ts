import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

// GET /api/favorites/[imageId] - Check if image is favorited
export async function GET(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ isFavorited: false })
    }

    const user = JSON.parse(userCookie.value)

    const result = await apiFetch(`/api/user/images/${imageId}/favorite?user_id=${user.id}`)

    if (!result.success) {
      return NextResponse.json({ isFavorited: false })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[favorites] Error in GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/favorites/[imageId] - Toggle favorite
export async function POST(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)

    const result = await apiFetch(
      `/api/user/images/${imageId}/favorite/toggle?user_id=${user.id}`,
      { method: "POST" }
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[favorites] Error in POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
