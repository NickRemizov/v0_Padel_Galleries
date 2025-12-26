import { env } from "./env"

export class ApiError extends Error {
  constructor(
    public status: number,
    public code?: string,
    message?: string,
  ) {
    super(message || `API Error: ${status}`)
    this.name = "ApiError"
  }
}

/**
 * Unified API response format (matches backend ApiResponse)
 */
interface ApiResponseFormat<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: string
  meta?: Record<string, any>
}

interface ApiFetchOptions extends RequestInit {
  timeout?: number
  retries?: number
  throwOnError?: boolean
  skipAuth?: boolean
}

/**
 * Check if running on server
 */
const isServer = typeof window === "undefined"

/**
 * Generate UUID
 */
function generateUUID(): string {
  if (isServer) {
    return require("crypto").randomUUID()
  }
  return crypto.randomUUID()
}

/**
 * Get Supabase access token (browser only)
 * Server Actions don't need auth - GET is public, POST auth handled by backend
 */
async function getAuthToken(): Promise<string | null> {
  if (isServer) {
    // Server Actions: skip auth, backend handles it
    return null
  }
  
  try {
    const { createClient } = await import("@/lib/supabase/client")
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  } catch (e) {
    console.warn("[apiClient] Failed to get auth token:", e)
    return null
  }
}

export async function apiFetch<T = any>(path: string, options: ApiFetchOptions = {}): Promise<ApiResponseFormat<T>> {
  const { timeout = 30000, retries = 3, throwOnError = false, skipAuth = false, headers = {}, ...fetchOptions } = options

  if (!env.FASTAPI_URL) {
    const errorResponse: ApiResponseFormat<T> = {
      success: false,
      error: "FASTAPI_URL environment variable is not set. Please configure it in Vercel dashboard.",
      code: "FASTAPI_URL_MISSING",
    }
    if (throwOnError) {
      throw new ApiError(503, errorResponse.code, errorResponse.error)
    }
    return errorResponse
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const url = `${env.FASTAPI_URL}${normalizedPath}`

  const requestId = generateUUID()

  // Get auth token (browser only)
  let authHeaders: Record<string, string> = {}
  if (!skipAuth && !isServer) {
    const token = await getAuthToken()
    if (token) {
      authHeaders["Authorization"] = `Bearer ${token}`
    }
  }

  const fetchWithTimeout = async (attemptNumber: number): Promise<ApiResponseFormat<T>> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      console.log(`[apiClient] Request ${requestId} (attempt ${attemptNumber}): ${fetchOptions.method || "GET"} ${url}`)

      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          ...authHeaders,
          ...headers,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const contentType = response.headers.get("content-type")
      let responseBody: any = null

      if (contentType?.includes("application/json")) {
        try {
          responseBody = await response.json()
        } catch {
          responseBody = null
        }
      }

      if (!response.ok) {
        const shouldRetry = (response.status >= 500 || response.status === 503) && attemptNumber < retries

        if (shouldRetry) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attemptNumber - 1), 10000)
          console.warn(`[apiClient] Request ${requestId} failed with ${response.status}, retrying...`)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return fetchWithTimeout(attemptNumber + 1)
        }

        if (responseBody && typeof responseBody === "object" && "success" in responseBody) {
          if (throwOnError) {
            throw new ApiError(response.status, responseBody.code, responseBody.error)
          }
          return responseBody as ApiResponseFormat<T>
        }

        let errorMessage = `HTTP ${response.status}`
        let errorCode: string | undefined

        if (responseBody) {
          if (Array.isArray(responseBody.detail)) {
            errorMessage = responseBody.detail
              .map((err: any) => `${err.loc?.join(".") || "unknown"}: ${err.msg || "error"}`)
              .join("; ")
            errorCode = "VALIDATION_ERROR"
          } else {
            errorMessage = responseBody.message || responseBody.detail || errorMessage
            errorCode = responseBody.code
          }
        }

        const errorResponse: ApiResponseFormat<T> = {
          success: false,
          error: errorMessage,
          code: errorCode || `HTTP_${response.status}`,
        }

        if (throwOnError) {
          throw new ApiError(response.status, errorResponse.code, errorResponse.error)
        }

        return errorResponse
      }

      if (responseBody) {
        return responseBody
      }

      const textBody = await response.text()
      return { success: true, data: textBody as any }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        if (attemptNumber < retries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attemptNumber - 1), 10000)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return fetchWithTimeout(attemptNumber + 1)
        }

        const errorResponse: ApiResponseFormat<T> = {
          success: false,
          error: `Request timed out after ${timeout}ms`,
          code: "TIMEOUT",
        }

        if (throwOnError) {
          throw new ApiError(408, errorResponse.code, errorResponse.error)
        }

        return errorResponse
      }

      if (error instanceof ApiError) {
        throw error
      }

      const errorResponse: ApiResponseFormat<T> = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        code: "FETCH_ERROR",
      }

      if (throwOnError) {
        throw new ApiError(500, errorResponse.code, errorResponse.error)
      }

      return errorResponse
    }
  }

  return fetchWithTimeout(1)
}
