/**
 * Decorator for server actions that automatically creates and provides Supabase client
 * Eliminates the need to manually create client and check for errors in every action
 *
 * @example
 * ```typescript
 * export async function myAction() {
 *   return withSupabase(async (supabase) => {
 *     const { data, error } = await supabase.from('table').select()
 *     if (error) return failure(error.message)
 *     return success(data)
 *   })
 * }
 * ```
 */

import { createClient } from "./server"
import { failure, type Result } from "@/lib/types/result"
import { logger } from "@/lib/logger"

/**
 * Wraps an async function with automatic Supabase client creation and error handling
 */
export async function withSupabase<T>(
  fn: (supabase: Awaited<ReturnType<typeof createClient>>) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    const supabase = await createClient()
    return await fn(supabase)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    logger.error("withSupabase", "Failed to create Supabase client or execute action", { error: errorMessage })
    return failure(errorMessage)
  }
}
