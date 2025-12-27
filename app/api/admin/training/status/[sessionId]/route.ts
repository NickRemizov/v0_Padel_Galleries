/**
 * Training Status API Route
 * 
 * Proxies to FastAPI: GET /api/v2/train/status/{sessionId}
 * 
 * @migrated 2025-12-27 - Unified response format
 */

import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"
import { requireAdmin } from "@/lib/auth/serverGuard"

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { sessionId } = await params

    const result = await apiFetch(`/api/v2/train/status/${sessionId}`)

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Error fetching training status:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch training status",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
