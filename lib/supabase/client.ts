import { createBrowserClient } from "@supabase/ssr"
import { logger } from "@/lib/logger"

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error("supabase/client", "Missing Supabase environment variables")
    logger.error("supabase/client", `NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? "present" : "missing"}`)
    logger.error("supabase/client", `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? "present" : "missing"}`)

    throw new Error(
      "Supabase environment variables are not configured. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.",
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
