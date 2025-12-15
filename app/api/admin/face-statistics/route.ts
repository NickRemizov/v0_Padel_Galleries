/**
 * Face Statistics API Route
 * 
 * Proxies to FastAPI: GET /api/admin/face-statistics
 * 
 * @migrated 2025-12-15 - Removed direct Supabase access
 */

import { apiFetch } from "@/lib/apiClient"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const top = searchParams.get("top") || "15"

  const result = await apiFetch(`/api/admin/face-statistics?top=${top}`)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to fetch statistics" },
      { status: 500 }
    )
  }

  // Return data directly to maintain backward compatibility
  return NextResponse.json(result.data)
}
