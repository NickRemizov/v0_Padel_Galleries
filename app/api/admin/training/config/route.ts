import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/apiClient"
import { requireAdmin } from "@/lib/auth/serverGuard"

const DEFAULT_CONFIG = {
  confidence_thresholds: {
    low_data: 0.75,
    medium_data: 0.65,
    high_data: 0.55,
  },
  context_weight: 0.1,
  min_faces_per_person: 3,
  auto_retrain_threshold: 25,
  auto_retrain_percentage: 0.1,
  quality_filters: {
    min_detection_score: 0.7,
    min_face_size: 80,
    min_blur_score: 80,
  },
}

export async function GET() {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    console.log("[v0] Fetching config from FastAPI")

    const response = await apiFetch("/api/v2/config", { timeout: 5000 })

    // apiFetch returns {success, data, error, code, meta}
    // Extract data for the frontend
    if (response.success && response.data) {
      console.log("[v0] Config received:", response.data)
      return NextResponse.json(response.data)
    }

    // Backend returned error
    console.error("[v0] Backend returned error:", response.error)
    return NextResponse.json({
      ...DEFAULT_CONFIG,
      error: "connection_failed",
      message: response.error || "Unknown error",
    })
  } catch (error) {
    console.error("[v0] Error fetching config from FastAPI:", error)

    return NextResponse.json({
      ...DEFAULT_CONFIG,
      error: "connection_failed",
      message: error instanceof ApiError ? error.message : "Unknown error",
    })
  }
}

export async function PUT(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const body = await request.json()

    console.log("[v0] Updating config:", body)

    const response = await apiFetch("/api/v2/config", {
      method: "PUT",
      body: JSON.stringify(body),
      timeout: 5000,
    })

    // apiFetch returns {success, data, error, code, meta}
    if (response.success) {
      console.log("[v0] Config updated successfully")
      return NextResponse.json(response.data || { updated: true })
    }

    // Backend returned error
    console.error("[v0] Backend returned error:", response.error)
    return NextResponse.json(
      {
        error: "connection_failed",
        message: response.error || "Unknown error",
      },
      { status: 500 },
    )
  } catch (error) {
    console.error("[v0] Error updating config:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          error: "connection_failed",
          message: error.message,
        },
        { status: error.status },
      )
    }

    return NextResponse.json(
      {
        error: "connection_failed",
        message: "FastAPI training endpoints not available. Check if backend is running.",
      },
      { status: 503 },
    )
  }
}
