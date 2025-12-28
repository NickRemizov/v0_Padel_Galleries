/**
 * Face Detection API Route
 * 
 * Proxies to FastAPI: POST /api/recognition/detect-faces
 * 
 * @migrated 2025-12-27 - Unified response format
 * @fixed 2025-12-28 - Proper HTTP status codes
 */

import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/apiClient"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Proxy: Received detect-faces request")

    const body = await request.json()
    console.log("[v0] Proxy: Image URL:", body.image_url)
    console.log("[v0] Proxy: Apply quality filters:", body.apply_quality_filters)

    const result = await apiFetch("/api/recognition/detect-faces", {
      method: "POST",
      body: JSON.stringify(body),
    })

    console.log("[v0] Proxy: Detected faces:", result.data?.length || 0)

    // Pass through unified response format with proper status
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Proxy: Error:", error)

    if (error instanceof ApiError) {
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
