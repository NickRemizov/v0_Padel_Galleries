/**
 * Training History API Route
 * 
 * Proxies to FastAPI: GET /api/v2/train/history
 * 
 * @migrated 2025-12-27 - Fixed error handling (no longer masks errors)
 */

import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"
import { requireAdmin, getAuthHeaders } from "@/lib/auth/serverGuard"

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get("limit") || "10"
    const offset = searchParams.get("offset") || "0"
    const authHeaders = await getAuthHeaders()

    const response = await apiFetch(`/api/v2/train/history?limit=${limit}&offset=${offset}`, {
      headers: authHeaders,
    })

    // Pass through the response as-is (unified contract)
    // On success: {success: true, data: {sessions: [...], total: N}}
    // On error: {success: false, error: "...", code: "..."}
    return NextResponse.json(response, {
      status: response.success ? 200 : 500
    })
  } catch (error) {
    console.error("[v0] Error fetching training history:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch training history",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
