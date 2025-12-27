/**
 * Check Gallery API Route
 * 
 * Proxies to FastAPI: GET /api/admin/check-gallery
 * 
 * Query params:
 * - all: "true" to list all galleries with photo counts
 * - id: Gallery UUID for detailed stats
 * - search: Search term for gallery title
 * 
 * @migrated 2025-12-27 - Unified response format
 */

import { apiFetch } from "@/lib/apiClient"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const galleryId = searchParams.get("id")
    const searchTerm = searchParams.get("search")
    const showAll = searchParams.get("all") === "true"

    // Build query string
    const params = new URLSearchParams()
    if (showAll) params.set("all", "true")
    if (galleryId) params.set("id", galleryId)
    if (searchTerm) params.set("search", searchTerm)
    
    const queryString = params.toString()
    const url = `/api/admin/check-gallery${queryString ? `?${queryString}` : ""}`

    const result = await apiFetch(url)

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Error checking gallery:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Check failed",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
