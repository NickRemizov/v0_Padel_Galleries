import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/auth/serverGuard"

// DELETE /api/comments/[imageId]/[commentId] - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string; commentId: string }> },
) {
  try {
    const { imageId, commentId } = await params
    const supabase = createServiceClient()

    // Get comment with image and gallery info for permission check
    const { data: comment } = await supabase
      .from("comments")
      .select(`
        user_id,
        gallery_images!inner (
          gallery_id,
          galleries!inner (
            created_by
          )
        )
      `)
      .eq("id", commentId)
      .eq("gallery_image_id", imageId)
      .single()

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 })
    }

    // Check admin permissions first
    const { admin } = await requireAdmin()

    if (admin) {
      const canDelete =
        admin.role === "owner" ||
        admin.role === "global_admin" ||
        (admin.role === "local_admin" &&
          (comment.gallery_images as any)?.galleries?.created_by === admin.id)

      if (canDelete) {
        const { error } = await supabase.from("comments").delete().eq("id", commentId)
        if (error) {
          console.error("[comments] Error deleting comment:", error)
          return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 })
        }
        return NextResponse.json({ success: true })
      }
    }

    // Check user permissions (comment author)
    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)
    if (comment.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { error } = await supabase.from("comments").delete().eq("id", commentId)

    if (error) {
      console.error("[comments] Error deleting comment:", error)
      return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[comments] Error in DELETE /api/comments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
