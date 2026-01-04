/**
 * Service Role Supabase Client
 *
 * This client uses the service role key which bypasses Row Level Security (RLS).
 * Use ONLY for server-side operations where user identity has been verified
 * through alternative means (e.g., Telegram auth).
 *
 * Security:
 * - NEVER expose this client to the browser
 * - ALWAYS verify user identity before using this client
 * - User ID should come from verified cookie, not user input
 */

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"

let serviceClient: SupabaseClient | null = null

/**
 * Get Supabase client with service role key (bypasses RLS).
 * Throws error if service role key is not configured.
 */
export function createServiceClient(): SupabaseClient {
  if (serviceClient) {
    return serviceClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured")
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. " +
      "This key is required for social features (likes, comments, favorites). " +
      "Get it from Supabase Dashboard > Settings > API > service_role key"
    )
  }

  serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return serviceClient
}
