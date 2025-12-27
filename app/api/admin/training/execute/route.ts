/**
 * Training Execute API Route
 * 
 * Proxies to FastAPI: POST /api/v2/train/execute
 * 
 * @migrated 2025-12-27 - Unified response format
 */

import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"
import { requireAdmin, getAuthHeaders } from "@/lib/auth/serverGuard"

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const body = await request.json()
    const headers = await getAuthHeaders()

    const result = await apiFetch("/api/v2/train/execute", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : 500
    })
  } catch (error) {
    console.error("[v0] Error executing training:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to execute training",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
