import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logActivity } from "@/lib/activity-logger"
import { logAdminActivity } from "@/lib/admin-activity-logger"

// POST /api/my-photos/[photoFaceId]/reject - This is not me, remove link
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

    const supabase = createServiceClient()

    // Verify the photo_face belongs to this user's person
    const { data: photoFace, error: fetchError } = await supabase
      .from("photo_faces")
      .select(`
        id, person_id, photo_id,
        gallery_images!inner(id, original_filename, gallery_id, galleries(title))
      `)
      .eq("id", photoFaceId)
      .single()

    if (fetchError || !photoFace) {
      return NextResponse.json({ error: "Photo face not found" }, { status: 404 })
    }

    if (photoFace.person_id !== user.person_id) {
      return NextResponse.json({ error: "Cannot reject other person's photos" }, { status: 403 })
    }

    // Log activity BEFORE removing person_id (need person_id for the log)
    const gi = photoFace.gallery_images as any
    await logActivity({
      personId: user.person_id,
      activityType: "photo_rejected",
      imageId: gi?.id,
      galleryId: gi?.gallery_id,
      metadata: {
        filename: gi?.original_filename,
        gallery_title: gi?.galleries?.title,
      },
    })

    // Log admin activity
    logAdminActivity({
      eventType: "photo_rejected",
      userId: user.id,
      personId: user.person_id,
      metadata: {
        filename: gi?.original_filename,
        gallery_title: gi?.galleries?.title,
      },
    })

    // Remove person link (set to null, unverified, unhide)
    // Also reset hidden_by_user - user no longer has right to hide this photo
    const { error: updateError } = await supabase
      .from("photo_faces")
      .update({
        person_id: null,
        verified: false,
        hidden_by_user: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoFaceId)

    if (updateError) {
      console.error("[my-photos] Error rejecting photo face:", updateError)
      return NextResponse.json({ error: "Failed to reject" }, { status: 500 })
    }

    console.log(`[my-photos] User ${user.id} rejected photo_face ${photoFaceId} (removed person_id)`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[my-photos] Error in reject endpoint:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
