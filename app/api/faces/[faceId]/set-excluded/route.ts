import { type NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"
import { getAuthHeaders } from "@/lib/auth/serverGuard"

// POST /api/faces/[faceId]/set-excluded - Exclude face from recognition index
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ faceId: string }> }
) {
  try {
    const { faceId } = await params
    const { searchParams } = new URL(request.url)
    const excluded = searchParams.get("excluded") ?? "true"

    // Get auth headers for FastAPI
    const authHeaders = await getAuthHeaders()

    // Call FastAPI
    const result = await apiFetch(
      `/api/faces/${faceId}/set-excluded?excluded=${excluded}`,
      { method: "POST", headers: authHeaders }
    )

    if (!result.success) {
      console.error("[faces] FastAPI error:", result.error)
      return NextResponse.json(
        { error: result.error || "Failed to set excluded" },
        { status: 400 }
      )
    }

    console.log(`[faces] Face ${faceId} excluded=${excluded}`)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[faces] Error in set-excluded endpoint:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
