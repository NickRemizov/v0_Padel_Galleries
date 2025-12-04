import { createBrowserClient } from "@supabase/ssr"
import { logger } from "@/lib/logger"

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.warn("supabase/client", "Supabase env variables missing - using mock client for preview")
    logger.warn("supabase/client", `NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? "present" : "missing"}`)
    logger.warn("supabase/client", `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? "present" : "missing"}`)

    // Return a mock client that won't break the app in preview
    return {
      from: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
        insert: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
        update: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
        delete: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
      }),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
      },
    } as any
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
