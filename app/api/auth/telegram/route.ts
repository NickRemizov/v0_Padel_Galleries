import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { verifyTelegramAuth, isTelegramAuthDataValid } from "@/lib/telegram-auth"
import { logAdminActivity } from "@/lib/admin-activity-logger"

/**
 * Telegram Login Logic:
 *
 * 1. Search by telegram_id (unique, never changes)
 *    - Found → update telegram_username (could have changed) and telegram_full_name
 *    - Not found → step 2
 *
 * 2. Search by telegram_username (case-insensitive, with @)
 *    - Found → link: set telegram_id, update telegram_full_name
 *    - Not found → step 3
 *
 * 3. Create new person with all Telegram data
 */

/**
 * Find person by telegram_id
 */
async function findPersonByTelegramId(
  supabase: any,
  telegramId: number
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("people")
    .select("id")
    .eq("telegram_id", telegramId)
    .single()

  return data
}

/**
 * Find person by telegram_username (case-insensitive)
 * Telegram gives username without @, database stores with @
 * Returns id, real_name, and telegram_full_name for activity logging
 */
async function findPersonByUsername(
  supabase: any,
  username: string
): Promise<{ id: string; real_name: string | null; telegram_full_name: string | null } | null> {
  // Add @ prefix and search case-insensitive
  const usernameWithAt = `@${username}`

  const { data } = await supabase
    .from("people")
    .select("id, real_name, telegram_full_name")
    .ilike("telegram_username", usernameWithAt)
    .single()

  return data
}

/**
 * Update person found by telegram_id
 * Username and name could have changed
 */
async function updatePersonFoundById(
  supabase: any,
  personId: string,
  firstName: string,
  lastName: string | null,
  username: string | null
): Promise<void> {
  const fullName = lastName ? `${firstName} ${lastName}` : firstName
  const telegramUsername = username ? `@${username}` : null

  const { error } = await supabase
    .from("people")
    .update({
      telegram_username: telegramUsername,  // Could have changed
      telegram_full_name: fullName,  // Could have changed
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId)

  if (error) {
    console.error("[telegram-auth] Error updating person by id:", error)
  }
}

/**
 * Link person found by username to Telegram account
 * Set telegram_id and update telegram_full_name
 */
async function linkPersonByUsername(
  supabase: any,
  personId: string,
  telegramId: number,
  firstName: string,
  lastName: string | null
): Promise<void> {
  const fullName = lastName ? `${firstName} ${lastName}` : firstName

  const { error } = await supabase
    .from("people")
    .update({
      telegram_id: telegramId,  // Link to Telegram account
      telegram_full_name: fullName,  // Update from Telegram
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId)

  if (error) {
    console.error("[telegram-auth] Error linking person by username:", error)
  }
}

/**
 * Create new person for first-time Telegram user
 */
async function createNewPerson(
  supabase: any,
  telegramId: number,
  firstName: string,
  lastName: string | null,
  username: string | null
): Promise<string> {
  const fullName = lastName ? `${firstName} ${lastName}` : firstName
  const telegramUsername = username ? `@${username}` : null

  const { data: newPerson, error } = await supabase
    .from("people")
    .insert({
      telegram_id: telegramId,
      telegram_username: telegramUsername,
      telegram_full_name: fullName,
      real_name: fullName,
      created_by: "auto_login",
      show_in_players_gallery: false,  // Don't show auto-created users in players list
    })
    .select("id")
    .single()

  if (error) {
    console.error("[telegram-auth] Error creating person:", error)
    throw error
  }

  console.log(`[telegram-auth] Created new person ${newPerson.id} for Telegram user ${telegramId}`)
  return newPerson.id
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

    // === FIND OR CREATE PERSON ===
    let personId: string

    // Step 1: Search by telegram_id
    const personById = await findPersonByTelegramId(supabase, id)

    if (personById) {
      // Found by telegram_id → update username and name (could have changed)
      personId = personById.id
      await updatePersonFoundById(supabase, personId, first_name, last_name, username)
      console.log(`[telegram-auth] Found person ${personId} by telegram_id ${id}`)
    } else if (username) {
      // Step 2: Search by telegram_username
      const personByUsername = await findPersonByUsername(supabase, username)

      if (personByUsername) {
        // Found by username → link to Telegram account
        personId = personByUsername.id
        const oldTelegramFullName = personByUsername.telegram_full_name
        const personName = personByUsername.real_name || oldTelegramFullName

        await linkPersonByUsername(supabase, personId, id, first_name, last_name)
        console.log(`[telegram-auth] Linked person ${personId} by username @${username}`)

        // Log admin activity: user linked
        const newTelegramFullName = last_name ? `${first_name} ${last_name}` : first_name
        const nameChanged = oldTelegramFullName && oldTelegramFullName !== newTelegramFullName

        logAdminActivity({
          eventType: "user_linked",
          personId,
          metadata: {
            telegram_username: `@${username}`,
            person_name: personName,
            telegram_full_name: newTelegramFullName,
            old_telegram_full_name: nameChanged ? oldTelegramFullName : null,
            linked_by: "username",
          },
        })
      } else {
        // Step 3: Create new person
        personId = await createNewPerson(supabase, id, first_name, last_name, username)

        // Log admin activity: user registered
        const fullName = last_name ? `${first_name} ${last_name}` : first_name
        logAdminActivity({
          eventType: "user_registered",
          personId,
          metadata: {
            telegram_username: username ? `@${username}` : null,
            telegram_full_name: fullName,
            person_name: fullName,
          },
        })
      }
    } else {
      // No username provided, create new person
      personId = await createNewPerson(supabase, id, first_name, last_name, username)

      // Log admin activity: user registered
      const fullName = last_name ? `${first_name} ${last_name}` : first_name
      logAdminActivity({
        eventType: "user_registered",
        personId,
        metadata: {
          telegram_username: null,
          telegram_full_name: fullName,
          person_name: fullName,
        },
      })
    }

    // === CREATE OR UPDATE USER ===
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
          person_id: personId,
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
    console.error("[telegram-auth] Error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
