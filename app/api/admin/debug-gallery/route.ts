/**
 * Debug Gallery API Route
 * 
 * Proxies to FastAPI: GET /api/admin/debug-gallery
 * 
 * Query params:
 * - id: Gallery UUID (optional, if omitted returns list of problem galleries)
 * - fix: "true" to auto-fix has_been_processed flags
 * 
 * @migrated 2025-12-15 - Removed direct Supabase access
 */

import { apiFetch } from "@/lib/apiClient"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
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

  if (!result.success) {
    const status = result.code === "NOT_FOUND" ? 404 : 500
    return NextResponse.json(
      { error: result.error || "Debug failed" },
      { status }
    )
  }

  return NextResponse.json(result.data)
}
