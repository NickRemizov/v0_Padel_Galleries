/**
 * Training Prepare API Route
 * 
 * Proxies to FastAPI: POST /api/v2/train/prepare
 * 
 * @migrated 2025-12-27 - Unified response format
 */

import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"
import { requireAdmin } from "@/lib/auth/serverGuard"

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const body = await request.json()

    console.log("[v0] Preparing dataset")

    const result = await apiFetch("/api/v2/train/prepare", {
      method: "POST",
      body: JSON.stringify(body),
    })

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : 500
    })
  } catch (error) {
    console.error("[v0] Error preparing dataset:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to prepare dataset",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
