/**
 * Galleries List API Route
 * 
 * Proxies to FastAPI: GET /api/galleries
 * Returns list of galleries with related data
 * 
 * @created 2025-12-27
 * Returns unified format: {success, data, error, code}
 */

import { NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export const revalidate = 60

export async function GET() {
  try {
    const result = await apiFetch("/api/galleries")

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Error in galleries API:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch galleries",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
