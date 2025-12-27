/**
 * Image People API Route
 * 
 * Proxies to FastAPI: GET /api/images/{imageId}/people
 * Returns verified people on a photo
 * 
 * @migrated 2025-12-27 - Migrated from direct Supabase to FastAPI
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

    if (!result.success) {
      // Return empty array for not found (backward compatibility with lightbox)
      if (result.code === "NOT_FOUND") {
        return NextResponse.json([])
      }
      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status: 500 }
      )
    }

    // Return data directly for backward compatibility with image-lightbox.tsx
    // Lightbox expects: [{id: "...", name: "..."}]
    return NextResponse.json(result.data || [])
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
