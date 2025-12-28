/**
 * Debug Gallery API Route
 * 
 * Proxies to FastAPI: GET /api/admin/debug-gallery
 * 
 * Query params:
 * - id: Gallery UUID (optional, if omitted returns list of problem galleries)
 * - fix: "true" to auto-fix has_been_processed flags
 * 
 * @migrated 2025-12-27 - Unified response format
 * @secured 2025-12-28 - Added requireAdmin()
 */

import { apiFetch } from "@/lib/apiClient"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/serverGuard"

export async function GET(request: Request) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const galleryId = searchParams.get("id")
    const fix = searchParams.get("fix") === "true"

    // Build query string
    const params = new URLSearchParams()
    if (galleryId) params.set("id", galleryId)
    if (fix) params.set("fix", "true")
    
    const queryString = params.toString()
    const url = `/api/admin/debug-gallery${queryString ? `?${queryString}` : ""}`

    const result = await apiFetch(url)

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Error debugging gallery:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Debug failed",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
