import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

// Allowed fields that user can update
const ALLOWED_FIELDS = [
  "real_name",
  "gmail",
  "facebook_profile_url",
  "instagram_profile_url",
  "paddle_ranking",
  "show_in_players_gallery",
  "create_personal_gallery",
  "show_name_on_photos",
  "show_telegram_username",
  "show_social_links",
]

// PUT /api/settings - Update current user's profile
export async function PUT(request: NextRequest) {
  try {
    // Get user from cookie
    const userCookie = request.cookies.get("telegram_user")
    if (!userCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)
    if (!user.person_id) {
      return NextResponse.json({ error: "No person linked to user" }, { status: 400 })
    }

    const body = await request.json()

    // Filter only allowed fields
    const updateData: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    // Enforce cascading logic for privacy settings:
    // show_name_on_photos=false -> create_personal_gallery=false, show_in_players_gallery=false
    // create_personal_gallery=false -> show_in_players_gallery=false
    if (updateData.show_name_on_photos === false) {
      updateData.create_personal_gallery = false
      updateData.show_in_players_gallery = false
    }
    if (updateData.create_personal_gallery === false) {
      updateData.show_in_players_gallery = false
    }

    // Validate gmail format if provided
    if (updateData.gmail && typeof updateData.gmail === "string") {
      if (!updateData.gmail.match(/^[a-zA-Z0-9._%+-]+@gmail\.com$/)) {
        return NextResponse.json({ error: "Invalid Gmail format" }, { status: 400 })
      }
    }

    // Validate paddle_ranking if provided
    if (updateData.paddle_ranking !== undefined) {
      const ranking = Number(updateData.paddle_ranking)
      if (isNaN(ranking) || ranking < 0 || ranking > 10) {
        return NextResponse.json({ error: "Paddle ranking must be between 0 and 10" }, { status: 400 })
      }
      // Round to 0.25 step
      updateData.paddle_ranking = Math.round(ranking * 4) / 4
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString()

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("people")
      .update(updateData)
      .eq("id", user.person_id)
      .select()
      .single()

    if (error) {
      console.error("[settings] Error updating profile:", error)
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
    }

    console.log(`[settings] User ${user.id} updated profile:`, Object.keys(updateData))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[settings] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
