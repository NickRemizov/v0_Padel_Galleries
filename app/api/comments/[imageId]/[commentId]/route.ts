import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/auth/serverGuard"

// PATCH /api/comments/[imageId]/[commentId] - Edit a comment (author only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string; commentId: string }> },
) {
  try {
    const { imageId, commentId } = await params

    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)
    const { content } = await request.json()

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Comment content is required" }, { status: 400 })
    }

    if (content.length > 1000) {
      return NextResponse.json({ error: "Comment is too long (max 1000 characters)" }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Check if comment belongs to user
    const { data: comment } = await supabase
      .from("comments")
      .select("user_id")
      .eq("id", commentId)
      .eq("gallery_image_id", imageId)
      .single()

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 })
    }

    if (comment.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: updated, error } = await supabase
      .from("comments")
      .update({
        content: content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .select(`
        *,
        users (
          id,
          telegram_id,
          username,
          first_name,
          last_name,
          photo_url
        )
      `)
      .single()

    if (error) {
      console.error("[comments] Error updating comment:", error)
      return NextResponse.json({ error: "Failed to update comment" }, { status: 500 })
    }

    return NextResponse.json({ comment: updated })
  } catch (error) {
    console.error("[comments] Error in PATCH /api/comments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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
