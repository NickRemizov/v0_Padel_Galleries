import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

// Now throws error instead of returning null
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error("supabase/server", "Missing Supabase environment variables")
    logger.error(
      "supabase/server",
      `NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "present" : "missing"}`,
    )
    logger.error("supabase/server", `SUPABASE_URL: ${process.env.SUPABASE_URL ? "present" : "missing"}`)
    logger.error(
      "supabase/server",
      `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "present" : "missing"}`,
    )
    logger.error("supabase/server", `SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? "present" : "missing"}`)

    throw new Error(
      "Supabase environment variables are not configured. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}
