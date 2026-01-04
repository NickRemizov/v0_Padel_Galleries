import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { verifyTelegramAuth, isTelegramAuthDataValid } from "@/lib/telegram-auth"

/**
 * Find existing person by Telegram ID or nickname
 * Priority: telegram_id (never changes) > telegram_username (@username)
 */
async function findExistingPerson(
  supabase: any,
  telegramId: number,
  username: string | null
): Promise<{ id: string } | null> {
  // First, try to find by telegram_id (most reliable, never changes)
  const { data: byTelegramId } = await supabase
    .from("people")
    .select("id")
    .eq("telegram_id", telegramId)
    .single()

  if (byTelegramId) {
    return byTelegramId
  }

  // Then try by telegram_username (@username)
  if (username) {
    const nicknameVariants = [username.toLowerCase(), `@${username.toLowerCase()}`]

    const { data: byNickname } = await supabase
      .from("people")
      .select("id, telegram_username")
      .or(`telegram_username.ilike.${username},telegram_username.ilike.@${username}`)
      .limit(1)
      .single()

    if (byNickname) {
      return byNickname
    }
  }

  return null
}

/**
 * Create a new person record for auto-registered user
 */
async function createPersonForUser(
  supabase: any,
  telegramId: number,
  firstName: string,
  lastName: string | null,
  username: string | null
): Promise<string> {
  const fullName = lastName ? `${firstName} ${lastName}` : firstName
  const telegramNickname = username ? `@${username}` : null

  const { data: newPerson, error } = await supabase
    .from("people")
    .insert({
      real_name: fullName,
      telegram_id: telegramId,
      telegram_username: telegramNickname,
      telegram_full_name: fullName,
      created_by: "auto_login",
      show_in_players_gallery: false,  // Don't show auto-created users in players gallery
      show_photos_in_galleries: true,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[v0] Error creating person:", error)
    throw error
  }

  console.log(`[v0] Created new person for Telegram user ${telegramId}: ${newPerson.id}`)
  return newPerson.id
}

/**
 * Update person's Telegram data (name can change)
 */
async function updatePersonTelegramData(
  supabase: any,
  personId: string,
  telegramId: number,
  firstName: string,
  lastName: string | null,
  username: string | null
): Promise<void> {
  const fullName = lastName ? `${firstName} ${lastName}` : firstName
  const telegramNickname = username ? `@${username}` : null

  const { error } = await supabase
    .from("people")
    .update({
      telegram_id: telegramId,  // Set if not already set
      telegram_full_name: fullName,  // Always update (can change)
      telegram_username: telegramNickname,  // Update if changed
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId)

  if (error) {
    console.error("[v0] Error updating person telegram data:", error)
    // Don't throw - this is not critical
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = body

    // Verify bot token exists
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json({ error: "Telegram bot token not configured" }, { status: 500 })
    }

    // Verify Telegram auth data
    const authData: Record<string, string> = { id: String(id), first_name, auth_date: String(auth_date), hash }
    if (last_name) authData.last_name = last_name
    if (username) authData.username = username
    if (photo_url) authData.photo_url = photo_url

    if (!verifyTelegramAuth(authData, botToken)) {
      return NextResponse.json({ error: "Invalid authentication data" }, { status: 401 })
    }

    // Check if auth data is not expired
    if (!isTelegramAuthDataValid(auth_date)) {
      return NextResponse.json({ error: "Authentication data expired" }, { status: 401 })
    }

    const supabase = createServiceClient()

    // 1. Find or create person
    let personId: string
    const existingPerson = await findExistingPerson(supabase, id, username)

    if (existingPerson) {
      personId = existingPerson.id
      // Update telegram data (name can change)
      await updatePersonTelegramData(supabase, personId, id, first_name, last_name, username)
      console.log(`[v0] Found existing person ${personId} for Telegram user ${id}`)
    } else {
      // Create new person
      personId = await createPersonForUser(supabase, id, first_name, last_name, username)
    }

    // 2. Create or update user
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", id)
      .single()

    let user
    if (existingUser) {
      // Update existing user
      const { data, error } = await supabase
        .from("users")
        .update({
          username,
          first_name,
          last_name,
          photo_url,
          person_id: personId,  // Always link to person
          updated_at: new Date().toISOString(),
        })
        .eq("telegram_id", id)
        .select()
        .single()

      if (error) throw error
      user = data
    } else {
      // Create new user
      const { data, error } = await supabase
        .from("users")
        .insert({
          telegram_id: id,
          username,
          first_name,
          last_name,
          photo_url,
          person_id: personId,
        })
        .select()
        .single()

      if (error) throw error
      user = data
    }

    // Create session cookie
    const response = NextResponse.json({ user })
    response.cookies.set("telegram_user", JSON.stringify(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    })

    return response
  } catch (error) {
    console.error("[v0] Telegram auth error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
