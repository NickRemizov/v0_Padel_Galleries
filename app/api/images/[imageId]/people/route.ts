/**
 * Image People API Route
 * 
 * Proxies to FastAPI: GET /api/images/{imageId}/people
 * Returns verified people on a photo
 * 
 * @migrated 2025-12-27 - Migrated from direct Supabase to FastAPI
 * Returns unified format: {success, data, error, code}
 */

import { NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export async function GET(
  request: Request, 
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params

    const result = await apiFetch(`/api/images/${imageId}/people`)

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Error in people API:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch people",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
