/**
 * Image Auto-Recognize API Route
 * 
 * Proxies to FastAPI: POST /api/images/{imageId}/auto-recognize
 * Triggers auto-recognition of unverified faces on a photo
 * 
 * @created 2025-12-28
 * Returns unified format: {success, data, error, code}
 */

import { NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export async function POST(
  request: Request, 
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params

    const result = await apiFetch(`/api/images/${imageId}/auto-recognize`, {
      method: "POST"
    })

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Error in auto-recognize API:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to auto-recognize",
        code: "RECOGNITION_ERROR"
      },
      { status: 500 }
    )
  }
}
