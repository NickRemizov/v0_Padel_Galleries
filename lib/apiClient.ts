import { env } from "./env"
import { randomUUID } from "crypto"

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
  /**
   * If true, throw ApiError on HTTP errors (legacy behavior).
   * If false (default), return {success: false, error, code} for HTTP errors.
   */
  throwOnError?: boolean
}

/**
 * Check if we're in build phase (static generation)
 * During build, we should not make API calls to external services
 */
function isBuildPhase(): boolean {
  // NEXT_PHASE is set during build
  return process.env.NEXT_PHASE === 'phase-production-build'
}

export async function apiFetch<T = any>(path: string, options: ApiFetchOptions = {}): Promise<ApiResponseFormat<T>> {
  const { timeout = 30000, retries = 3, throwOnError = false, headers = {}, ...fetchOptions } = options

  // Skip API calls during build phase to prevent build failures
  if (isBuildPhase()) {
    console.log(`[apiClient] Skipping API call during build phase: ${path}`)
    return {
      success: true,
      data: [] as any, // Return empty array for list endpoints
    }
  }

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

  const requestId = randomUUID()

  const fetchWithTimeout = async (attemptNumber: number): Promise<ApiResponseFormat<T>> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      console.log(`[apiClient] Request ${requestId} (attempt ${attemptNumber}): ${fetchOptions.method || "GET"} ${url}`)
      if (fetchOptions.body) {
        console.log(`[apiClient] Request ${requestId} body:`, fetchOptions.body)
      }

      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          ...headers,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Try to parse JSON response body (backend always returns JSON)
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
        // Check if we should retry (5xx errors)
        const shouldRetry = (response.status >= 500 || response.status === 503) && attemptNumber < retries

        if (shouldRetry) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attemptNumber - 1), 10000)
          console.warn(
            `[apiClient] Request ${requestId} failed with ${response.status}, retrying after ${backoffDelay}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return fetchWithTimeout(attemptNumber + 1)
        }

        // Backend returns {success: false, error: "...", code: "..."} format
        // Use it directly if available
        if (responseBody && typeof responseBody === "object" && "success" in responseBody) {
          console.log(`[apiClient] Request ${requestId} failed with ${response.status}:`, responseBody)
          if (throwOnError) {
            throw new ApiError(response.status, responseBody.code, responseBody.error)
          }
          return responseBody as ApiResponseFormat<T>
        }

        // Fallback: construct error response from HTTP status
        let errorMessage = `HTTP ${response.status}`
        let errorCode: string | undefined

        if (responseBody) {
          // Handle FastAPI validation errors (detail is array of error objects)
          if (Array.isArray(responseBody.detail)) {
            const validationErrors = responseBody.detail
              .map((err: any) => {
                const field = Array.isArray(err.loc) ? err.loc.join(".") : "unknown"
                return `${field}: ${err.msg || err.message || "validation error"}`
              })
              .join("; ")
            errorMessage = validationErrors || errorMessage
            errorCode = "VALIDATION_ERROR"
          } else {
            errorMessage = responseBody.message || responseBody.detail || errorMessage
            errorCode = responseBody.code
          }
        } else {
          errorMessage = response.statusText || errorMessage
        }

        const errorResponse: ApiResponseFormat<T> = {
          success: false,
          error: errorMessage,
          code: errorCode || `HTTP_${response.status}`,
        }

        console.log(`[apiClient] Request ${requestId} failed with ${response.status}:`, errorResponse)

        if (throwOnError) {
          throw new ApiError(response.status, errorResponse.code, errorResponse.error)
        }

        return errorResponse
      }

      // Success response
      if (responseBody) {
        console.log(`[apiClient] Request ${requestId} succeeded - Response:`, JSON.stringify(responseBody, null, 2))
        return responseBody
      }

      // Non-JSON success response (rare)
      const textBody = await response.text()
      return { success: true, data: textBody as any }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        if (attemptNumber < retries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attemptNumber - 1), 10000)
          console.warn(`[apiClient] Request ${requestId} timed out, retrying after ${backoffDelay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return fetchWithTimeout(attemptNumber + 1)
        }

        const errorResponse: ApiResponseFormat<T> = {
          success: false,
          error: `Request timed out after ${timeout}ms (${retries} attempts)`,
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

      // Network or other error
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
