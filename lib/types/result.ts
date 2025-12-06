/**
 * Standard Result type for consistent error handling
 * Used across all server actions and API routes
 */
export type Result<T> = { success: true; data: T } | { success: false; error: string }

/**
 * Helper to create a successful result
 */
export function success<T>(data: T): Result<T> {
  return { success: true, data }
}

/**
 * Helper to create a failure result
 */
export function failure<T = never>(error: string): Result<T> {
  return { success: false, error }
}

/**
 * Type guard to check if result is successful
 */
export function isSuccess<T>(result: Result<T>): result is { success: true; data: T } {
  return result.success === true
}

/**
 * Type guard to check if result is failure
 */
export function isFailure<T>(result: Result<T>): result is { success: false; error: string } {
  return result.success === false
}
