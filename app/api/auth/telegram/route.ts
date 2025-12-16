import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { verifyTelegramAuth, isTelegramAuthDataValid } from "@/lib/telegram-auth"

// Try to find matching person by Telegram name/nickname
async function findMatchingPerson(
  supabase: any,
  username: string | null,
  firstName: string | null,
  lastName: string | null
): Promise<string | null> {
  if (!username && !firstName) return null

  // Build search queries
  const searchTerms: string[] = []
  if (username) searchTerms.push(username.toLowerCase())
  if (firstName) searchTerms.push(firstName.toLowerCase())
  if (firstName && lastName) searchTerms.push(`${firstName} ${lastName}`.toLowerCase())

  // Search in people table
  const { data: people } = await supabase
    .from("people")
    .select("id, telegram_name, telegram_nickname, real_name")

  if (!people || people.length === 0) return null

  // Find match by telegram_name, telegram_nickname, or real_name
  for (const person of people) {
    const telegramName = person.telegram_name?.toLowerCase()
    const telegramNickname = person.telegram_nickname?.toLowerCase()
    const realName = person.real_name?.toLowerCase()

    for (const term of searchTerms) {
      if (
        (telegramName && telegramName === term) ||
        (telegramNickname && telegramNickname === term) ||
        (telegramNickname && telegramNickname === `@${term}`) ||
        (realName && realName === term)
      ) {
        return person.id
      }
    }
  }

  return null
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
    const authData = { id: String(id), first_name, auth_date: String(auth_date), hash }
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

    // Create or update user in database
    const supabase = await createClient()

    const { data: existingUser } = await supabase.from("users").select("*").eq("telegram_id", id).single()

    let user
    if (existingUser) {
      // Update existing user
      const updateData: any = {
        username,
        first_name,
        last_name,
        photo_url,
        updated_at: new Date().toISOString(),
      }

      // Try to link to person if not already linked
      if (!existingUser.person_id) {
        const personId = await findMatchingPerson(supabase, username, first_name, last_name)
        if (personId) {
          updateData.person_id = personId
        }
      }

      const { data, error } = await supabase
        .from("users")
        .update(updateData)
        .eq("telegram_id", id)
        .select()
        .single()

      if (error) throw error
      user = data
    } else {
      // Try to find matching person for new user
      const personId = await findMatchingPerson(supabase, username, first_name, last_name)

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
