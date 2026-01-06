import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"
import { requireAdmin } from "@/lib/auth/serverGuard"

// PATCH /api/comments/[imageId]/[commentId] - Edit a comment (author only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string; commentId: string }> },
) {
  try {
    const { commentId } = await params

    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)
    const { content } = await request.json()

    const result = await apiFetch(
      `/api/user/comments/${commentId}?user_id=${user.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ content }),
      }
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[comments] Error in PATCH:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/comments/[imageId]/[commentId] - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string; commentId: string }> },
) {
  try {
    const { commentId } = await params

    // Check admin permissions first
    const { admin } = await requireAdmin()

    let url = `/api/user/comments/${commentId}?`

    if (admin) {
      url += `is_admin=true&admin_role=${admin.role}&admin_id=${admin.id}`
    } else {
      // Check user permissions
      const userCookie = request.cookies.get("telegram_user")
      if (!userCookie) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const user = JSON.parse(userCookie.value)
      url += `user_id=${user.id}`
    }

    const result = await apiFetch(url, { method: "DELETE" })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[comments] Error in DELETE:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
