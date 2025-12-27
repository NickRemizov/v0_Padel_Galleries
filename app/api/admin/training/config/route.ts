/**
 * Training Config API Route
 * 
 * Proxies to FastAPI: GET/PUT /api/v2/config
 * 
 * @migrated 2025-12-27 - Unified response format
 */

import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"
import { requireAdmin } from "@/lib/auth/serverGuard"

export async function GET() {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const result = await apiFetch("/api/v2/config", { timeout: 5000 })

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : 500
    })
  } catch (error) {
    console.error("[v0] Error fetching config:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch config",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const body = await request.json()

    const result = await apiFetch("/api/v2/config", {
      method: "PUT",
      body: JSON.stringify(body),
      timeout: 5000,
    })

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : 500
    })
  } catch (error) {
    console.error("[v0] Error updating config:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to update config",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
