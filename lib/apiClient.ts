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

interface ApiFetchOptions extends RequestInit {
  timeout?: number
  retries?: number
}

export async function apiFetch<T = any>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeout = 30000, retries = 3, headers = {}, ...fetchOptions } = options

  if (!env.FASTAPI_URL) {
    throw new ApiError(
      503,
      "FASTAPI_URL_MISSING",
      "FASTAPI_URL environment variable is not set. Please configure it in Vercel dashboard.",
    )
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const url = `${env.FASTAPI_URL}${normalizedPath}`

  const requestId = randomUUID()

  const fetchWithTimeout = async (attemptNumber: number): Promise<T> => {
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

      if (!response.ok) {
        const contentType = response.headers.get("content-type")
        let errorMessage = `HTTP ${response.status}`
        let errorCode: string | undefined

        if (contentType?.includes("application/json")) {
          try {
            const errorData = await response.json()

            // Handle FastAPI validation errors (detail is array of error objects)
            if (Array.isArray(errorData.detail)) {
              const validationErrors = errorData.detail
                .map((err: any) => {
                  const field = Array.isArray(err.loc) ? err.loc.join(".") : "unknown"
                  return `${field}: ${err.msg || err.message || "validation error"}`
                })
                .join("; ")
              errorMessage = validationErrors || errorMessage
            } else {
              errorMessage = errorData.message || errorData.detail || errorMessage
            }

            errorCode = errorData.code
          } catch {
            errorMessage = response.statusText || errorMessage
          }
        } else {
          const text = await response.text()
          errorMessage = text || response.statusText || errorMessage
        }

        const shouldRetry = (response.status >= 500 || response.status === 503) && attemptNumber < retries

        if (shouldRetry) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attemptNumber - 1), 10000)
          console.warn(
            `[apiClient] Request ${requestId} failed with ${response.status}, retrying after ${backoffDelay}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return fetchWithTimeout(attemptNumber + 1)
        }

        throw new ApiError(response.status, errorCode, errorMessage)
      }

      const contentType = response.headers.get("content-type")
      if (contentType?.includes("application/json")) {
        const data = await response.json()
        console.log(`[apiClient] Request ${requestId} succeeded - Response:`, JSON.stringify(data, null, 2))
        return data
      }

      return (await response.text()) as any
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        if (attemptNumber < retries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attemptNumber - 1), 10000)
          console.warn(`[apiClient] Request ${requestId} timed out, retrying after ${backoffDelay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return fetchWithTimeout(attemptNumber + 1)
        }
        throw new ApiError(408, "TIMEOUT", `Request timed out after ${timeout}ms (${retries} attempts)`)
      }

      if (error instanceof ApiError) {
        throw error
      }

      throw new ApiError(500, "FETCH_ERROR", error instanceof Error ? error.message : "Unknown error")
    }
  }

  return fetchWithTimeout(1)
}
