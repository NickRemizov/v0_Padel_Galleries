import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/apiClient"
import { requireAdmin } from "@/lib/auth/serverGuard"

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get("limit") || "10"
    const offset = searchParams.get("offset") || "0"

    const response = await apiFetch(`/api/v2/train/history?limit=${limit}&offset=${offset}`)

    // apiFetch returns {success, data, error, code, meta}
    // Extract data for the frontend
    if (response.success && response.data) {
      return NextResponse.json(response.data)
    }

    // Backend returned error or no data
    return NextResponse.json({ sessions: [], total: 0 })
  } catch (error) {
    console.error("[v0] Error fetching training history:", error)
    return NextResponse.json({ sessions: [], total: 0 })
  }
}
