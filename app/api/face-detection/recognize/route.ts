/**
 * Face Recognition API Route
 * 
 * Proxies to FastAPI: POST /api/recognition/recognize-face
 * 
 * @migrated 2025-12-27 - Unified response format
 * @fixed 2025-12-28 - Proper HTTP status codes
 */

import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/apiClient"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Proxy: Received recognize-face request")

    const body = await request.json()
    console.log("[v0] Proxy: Embedding length:", body.embedding?.length || 0)
    console.log("[v0] Proxy: Confidence threshold:", body.confidence_threshold)

    if (!process.env.FASTAPI_URL) {
      console.error("[v0] Proxy: FASTAPI_URL is not configured")
      return NextResponse.json(
        {
          success: false,
          error: "FastAPI server is not configured",
          code: "FASTAPI_URL_MISSING"
        },
        { status: 503 }
      )
    }

    const result = await apiFetch("/api/recognition/recognize-face", {
      method: "POST",
      body: JSON.stringify(body),
    })

    console.log("[v0] Proxy: Recognition result:", result)

    // Pass through unified response format with proper status
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Proxy: Error:", error)

    if (error instanceof ApiError) {
      if (error.code === "FASTAPI_URL_MISSING") {
        return NextResponse.json(
          { 
            success: false,
            error: error.message,
            code: "FASTAPI_URL_MISSING"
          }, 
          { status: 503 }
        )
      }
      return NextResponse.json(
        { 
          success: false,
          error: error.message,
          code: error.code || "API_ERROR"
        }, 
        { status: error.status }
      )
    }

    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
