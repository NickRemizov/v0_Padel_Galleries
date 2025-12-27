/**
 * Face Statistics API Route
 * 
 * Proxies to FastAPI: GET /api/admin/face-statistics
 * 
 * @migrated 2025-12-27 - Unified response format
 */

import { apiFetch } from "@/lib/apiClient"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const top = searchParams.get("top") || "15"

    const result = await apiFetch(`/api/admin/face-statistics?top=${top}`)

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : 500
    })
  } catch (error) {
    console.error("[v0] Error fetching face statistics:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch statistics",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
