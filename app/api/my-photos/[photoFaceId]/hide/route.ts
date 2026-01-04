import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

// POST /api/my-photos/[photoFaceId]/hide - Hide photo from public galleries
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
      .select("id, person_id, photo_id")
      .eq("id", photoFaceId)
      .single()

    if (fetchError || !photoFace) {
      return NextResponse.json({ error: "Photo face not found" }, { status: 404 })
    }

    if (photoFace.person_id !== user.person_id) {
      return NextResponse.json({ error: "Cannot hide other person's photos" }, { status: 403 })
    }

    // Check if this person is the only one on the photo
    const { count } = await supabase
      .from("photo_faces")
      .select("id", { count: "exact", head: true })
      .eq("photo_id", photoFace.photo_id)
      .not("person_id", "is", null)

    if (count && count > 1) {
      return NextResponse.json(
        { error: "Cannot hide photo with multiple people" },
        { status: 400 }
      )
    }

    // Hide the photo
    const { error: updateError } = await supabase
      .from("photo_faces")
      .update({
        hidden_by_user: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoFaceId)

    if (updateError) {
      console.error("[v0] Error hiding photo face:", updateError)
      return NextResponse.json({ error: "Failed to hide" }, { status: 500 })
    }

    console.log(`[v0] User ${user.id} hid photo_face ${photoFaceId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in hide endpoint:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
