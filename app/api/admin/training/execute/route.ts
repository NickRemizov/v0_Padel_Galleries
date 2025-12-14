import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/apiClient"
import { requireAdmin } from "@/lib/auth/serverGuard"

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const body = await request.json()

    console.log("[v0] Starting training")
    console.log("[v0] Request body:", JSON.stringify(body))

    const response = await apiFetch("/api/v2/train/execute", {
      method: "POST",
      body: JSON.stringify(body),
    })

    // apiFetch returns {success, data, error, code, meta}
    if (response.success && response.data) {
      console.log("[v0] Successfully started training, session_id:", response.data.session_id)
      return NextResponse.json(response.data)
    }

    // Backend returned error
    console.error("[v0] Backend returned error:", response.error)
    return NextResponse.json(
      { error: response.error || "Failed to execute training" },
      { status: 500 },
    )
  } catch (error) {
    console.error("[v0] Error executing training:", error)

    if (error instanceof ApiError) {
      if (error.status === 503 || error.status === 404) {
        return NextResponse.json(
          {
            error:
              "FastAPI training endpoints not available. Please deploy the updated FastAPI code with training endpoints.",
          },
          { status: 503 },
        )
      }

      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute training" },
      { status: 500 },
    )
  }
}
