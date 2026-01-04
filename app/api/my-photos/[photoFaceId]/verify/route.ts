import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

// POST /api/my-photos/[photoFaceId]/verify - Verify that this is me
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
      .select("id, person_id")
      .eq("id", photoFaceId)
      .single()

    if (fetchError || !photoFace) {
      return NextResponse.json({ error: "Photo face not found" }, { status: 404 })
    }

    if (photoFace.person_id !== user.person_id) {
      return NextResponse.json({ error: "Cannot verify other person's photos" }, { status: 403 })
    }

    // Update to verified
    const { error: updateError } = await supabase
      .from("photo_faces")
      .update({
        verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoFaceId)

    if (updateError) {
      console.error("[v0] Error verifying photo face:", updateError)
      return NextResponse.json({ error: "Failed to verify" }, { status: 500 })
    }

    console.log(`[v0] User ${user.id} verified photo_face ${photoFaceId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in verify endpoint:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
