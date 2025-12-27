/**
 * Gallery Detail API Route
 * 
 * Proxies to FastAPI: GET /api/galleries/{id}
 * Returns gallery with images and people data
 * 
 * @created 2025-12-27
 * Returns unified format: {success, data, error, code}
 */

import { NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export const revalidate = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const result = await apiFetch(`/api/galleries/${id}`)

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : 500)
    })
  } catch (error) {
    console.error("[v0] Error in gallery API:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch gallery",
        code: "FETCH_ERROR"
      },
      { status: 500 }
    )
  }
}
