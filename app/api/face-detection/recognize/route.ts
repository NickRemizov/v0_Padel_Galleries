import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/apiClient"

export async function POST(request: NextRequest) {
  try {
    console.log("[v2.20] Proxy: Received recognize-face request")

    const body = await request.json()
    console.log("[v2.20] Proxy: Embedding length:", body.embedding?.length || 0)
    console.log("[v2.20] Proxy: Confidence threshold:", body.confidence_threshold)

    if (!process.env.FASTAPI_URL) {
      console.error("[v2.20] Proxy: FASTAPI_URL is not configured")
      return NextResponse.json(
        {
          error: "FastAPI server is not configured",
          details: "FASTAPI_URL environment variable is missing. Please set it in Vercel dashboard.",
          person_id: null,
          confidence: null,
        },
        { status: 503 },
      )
    }

    const data = await apiFetch("/api/recognition/recognize-face", {
      method: "POST",
      body: JSON.stringify(body),
    })

    console.log("[v2.20] Proxy: Recognition result:", data)

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v2.20] Proxy: Error:", error)

    if (error instanceof ApiError) {
      if (error.code === "FASTAPI_URL_MISSING") {
        return NextResponse.json({ person_id: null, confidence: null, error: error.message }, { status: 503 })
      }
      return NextResponse.json({ error: "Failed to recognize face", details: error.message }, { status: error.status })
    }

    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
