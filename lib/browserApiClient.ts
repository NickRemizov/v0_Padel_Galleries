"use client"

/**
 * Browser-only API client for client components
 * 
 * Routes /api/admin/* through Next.js API routes (proxy) to avoid CORS/Mixed Content.
 * Other paths go directly to FastAPI (for future HTTPS setup).
 */

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://23.88.61.20:8001"

export interface ApiResponseFormat<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: string
  meta?: Record<string, any>
}

interface ApiFetchOptions extends RequestInit {
  timeout?: number
  retries?: number
}

/**
 * Browser API client
 * - /api/admin/* → Next.js API routes (proxy to FastAPI, avoids CORS/Mixed Content)
 * - Other paths → Direct FastAPI (when HTTPS is configured)
 */
export async function browserApiFetch<T = any>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<ApiResponseFormat<T>> {
  const { timeout = 30000, retries = 3, headers = {}, ...fetchOptions } = options

  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  
  // Route admin endpoints through Next.js proxy to avoid CORS/Mixed Content
  const isAdminPath = normalizedPath.startsWith("/api/admin/")
  
  let url: string
  if (isAdminPath) {
    // Use relative URL → goes to Next.js API routes (same origin)
    url = normalizedPath
  } else {
    // Direct FastAPI call (requires HTTPS when configured)
    if (!FASTAPI_URL) {
      return {
        success: false,
        error: "NEXT_PUBLIC_FASTAPI_URL is not configured",
        code: "CONFIG_ERROR",
      }
    }
    url = `${FASTAPI_URL}${normalizedPath}`
  }
  
  const requestId = crypto.randomUUID()

  const fetchWithTimeout = async (attemptNumber: number): Promise<ApiResponseFormat<T>> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      console.log(`[browserApiClient] Request ${requestId} (attempt ${attemptNumber}): ${fetchOptions.method || "GET"} ${url}`)

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
          console.warn(`[browserApiClient] Request ${requestId} failed with ${response.status}, retrying...`)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return fetchWithTimeout(attemptNumber + 1)
        }

        if (responseBody && typeof responseBody === "object" && "success" in responseBody) {
          return responseBody as ApiResponseFormat<T>
        }

        let errorMessage = `HTTP ${response.status}`
        if (responseBody) {
          if (Array.isArray(responseBody.detail)) {
            errorMessage = responseBody.detail.map((e: any) => e.msg).join("; ")
          } else {
            errorMessage = responseBody.message || responseBody.detail || errorMessage
          }
        }

        return {
          success: false,
          error: errorMessage,
          code: `HTTP_${response.status}`,
        }
      }

      // Success
      if (responseBody) {
        // Handle both wrapped {success, data} and direct response formats
        if (typeof responseBody === "object" && "success" in responseBody) {
          return responseBody as ApiResponseFormat<T>
        }
        return { success: true, data: responseBody as T }
      }

      return { success: true, data: undefined }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        if (attemptNumber < retries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attemptNumber - 1), 10000)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return fetchWithTimeout(attemptNumber + 1)
        }

        return {
          success: false,
          error: `Request timed out after ${timeout}ms`,
          code: "TIMEOUT",
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        code: "FETCH_ERROR",
      }
    }
  }

  return fetchWithTimeout(1)
}
