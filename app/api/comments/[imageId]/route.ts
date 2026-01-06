import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

// GET /api/comments/[imageId] - Get all comments for an image
export async function GET(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    const result = await apiFetch(`/api/user/images/${imageId}/comments`)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[comments] Error in GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/comments/[imageId] - Add a new comment
export async function POST(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)
    const { content } = await request.json()

    const result = await apiFetch(
      `/api/user/images/${imageId}/comments?user_id=${user.id}`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      }
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[comments] Error in POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
