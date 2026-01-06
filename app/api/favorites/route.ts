import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

// GET /api/favorites - Get all favorites for current user
export async function GET(request: NextRequest) {
  try {
    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)

    const result = await apiFetch(`/api/user/favorites?user_id=${user.id}`)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[favorites] Error in GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
